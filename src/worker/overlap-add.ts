/**
 * Pure, dependency-free segmentation + weighted overlap-add. This is the exact
 * chunking scheme the HT-Demucs reference inference uses (StemSplit/demucs-onnx
 * and the model's bundled `infer.py`): fixed 7.8 s segments with quarter-length
 * overlap, a triangular transition window, weighted accumulation, then divide
 * by the summed weight. Kept isolated from `onnxruntime-node` so it can be
 * unit-tested in a plain Node environment.
 *
 * Note: the model normalizes each segment internally (demucs v4 bakes the
 * mean/std normalize + denormalize into `HTDemucs.forward`, so it is part of
 * the exported graph). We therefore feed raw segments and do NOT normalize
 * here — matching both reference implementations exactly.
 */

/** Model sample rate. Inputs must already be resampled to this. */
export const SAMPLE_RATE = 44_100;

/** Channels the model consumes and emits. */
export const N_CHANNELS = 2;

/** Segment length baked into the exported graph: 7.8 s @ 44.1 kHz stereo. */
export const N_SAMPLES = 343_980;

/** Overlap between consecutive segments (quarter of a segment). */
export const OVERLAP = Math.floor(N_SAMPLES / 4);

/** Hop between consecutive segment starts. */
export const STRIDE = N_SAMPLES - OVERLAP;

/** Stem order emitted by htdemucs / htdemucs_ft. */
export const SOURCES = ["drums", "bass", "other", "vocals"] as const;

const DEFAULT_OVERLAP_FRACTION = 0.25;
const WEIGHT_EPSILON = 1e-8;

/** A segment's start offset and how many real (unpadded) samples it covers. */
export interface SegmentPlan {
  length: number;
  start: number;
}

/**
 * Build a triangular fade-in / fade-out window of length `segment`. The fade
 * spans `floor(segment * overlapFraction)` samples at each end and the middle
 * stays at 1. Matches numpy `linspace(0, 1, transition)`.
 */
export function makeTransitionWindow(
  segment: number,
  overlapFraction = DEFAULT_OVERLAP_FRACTION
): Float32Array {
  const window = new Float32Array(segment).fill(1);
  const transition = Math.floor(segment * overlapFraction);
  if (transition <= 0) {
    return window;
  }
  for (let i = 0; i < transition; i += 1) {
    const value = transition === 1 ? 0 : i / (transition - 1);
    window[i] = value;
    window[segment - 1 - i] = value;
  }
  return window;
}

/**
 * Plan the segments covering `totalLen` samples given a `segment` size and
 * `stride`. The final segment is short when the audio doesn't divide evenly;
 * callers zero-pad it up to `segment` before inference and only write back its
 * real `length`.
 */
export function planSegments(
  totalLen: number,
  segment: number,
  stride: number
): SegmentPlan[] {
  const count = Math.max(1, Math.ceil(totalLen / stride));
  const plans: SegmentPlan[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = i * stride;
    const end = Math.min(start + segment, totalLen);
    plans.push({ length: Math.max(0, end - start), start });
  }
  return plans;
}

/** Copy one (possibly short) segment of `mix` into a zero-padded flat buffer. */
function fillSegment(
  mix: Float32Array[],
  segment: number,
  plan: SegmentPlan,
  mixSegment: Float32Array
): void {
  mixSegment.fill(0);
  for (let ch = 0; ch < mix.length; ch += 1) {
    const base = ch * segment;
    const source = mix[ch];
    for (let j = 0; j < plan.length; j += 1) {
      mixSegment[base + j] = source[plan.start + j];
    }
  }
}

/** Add a segment's windowed stem output into the running accumulators. */
function accumulateSegment(
  out: Float32Array[][],
  weight: Float32Array,
  result: Float32Array,
  window: Float32Array,
  segment: number,
  plan: SegmentPlan
): void {
  const numChannels = out[0].length;
  for (let s = 0; s < out.length; s += 1) {
    for (let ch = 0; ch < numChannels; ch += 1) {
      const base = (s * numChannels + ch) * segment;
      const target = out[s][ch];
      for (let j = 0; j < plan.length; j += 1) {
        target[plan.start + j] += result[base + j] * window[j];
      }
    }
  }
  for (let j = 0; j < plan.length; j += 1) {
    weight[plan.start + j] += window[j];
  }
}

/** Inputs for {@link weightedOverlapAdd}. */
export interface OverlapAddOptions {
  /** Planar input channels, each `totalLen` samples long. */
  mix: Float32Array[];
  /** Number of stems the model emits per segment. */
  nStems: number;
  /** Called after each processed segment with `(done, total)`. */
  onSegment?: (done: number, total: number) => void;
  /**
   * Run one padded segment. Receives a flat `channels * segment` buffer
   * (channel-major) and returns a flat `nStems * channels * segment` buffer.
   */
  runSegment: (
    mixSegment: Float32Array
  ) => Float32Array | Promise<Float32Array>;
  /** Samples per segment. */
  segment: number;
  /** Hop between segment starts. */
  stride: number;
  /** Transition window of length `segment`. */
  window: Float32Array;
}

/**
 * Segment `mix`, run each segment through `runSegment`, and reconstruct each
 * stem with a weighted overlap-add. Returns `stems[stem][channel]`, each a
 * `Float32Array` of the original `totalLen`.
 */
export async function weightedOverlapAdd(
  options: OverlapAddOptions
): Promise<Float32Array[][]> {
  const { mix, nStems, onSegment, runSegment, segment, stride, window } =
    options;
  const numChannels = mix.length;
  const totalLen = mix[0]?.length ?? 0;
  const plans = planSegments(totalLen, segment, stride);

  const out = Array.from({ length: nStems }, () =>
    Array.from({ length: numChannels }, () => new Float32Array(totalLen))
  );
  const weight = new Float32Array(totalLen);
  const mixSegment = new Float32Array(numChannels * segment);

  for (let p = 0; p < plans.length; p += 1) {
    fillSegment(mix, segment, plans[p], mixSegment);
    // Sequential by design: one shared ONNX session, and holding every
    // segment's output in memory at once would be prohibitive.
    // biome-ignore lint/performance/noAwaitInLoops: segments must run serially
    const result = await runSegment(mixSegment);
    accumulateSegment(out, weight, result, window, segment, plans[p]);
    onSegment?.(p + 1, plans.length);
  }

  for (let s = 0; s < nStems; s += 1) {
    for (let ch = 0; ch < numChannels; ch += 1) {
      const target = out[s][ch];
      for (let j = 0; j < totalLen; j += 1) {
        target[j] /= Math.max(weight[j], WEIGHT_EPSILON);
      }
    }
  }
  return out;
}
