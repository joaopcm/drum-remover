import { InferenceSession, Tensor } from "onnxruntime-node";
import {
  makeTransitionWindow,
  N_CHANNELS,
  N_SAMPLES,
  SOURCES,
  STRIDE,
  weightedOverlapAdd,
} from "./overlap-add";

/**
 * HT-Demucs ONNX inference. Loads the provisioned model, runs the pure
 * overlap-add engine over the input mix, and returns the four stems (drums,
 * bass, other, vocals) as planar stereo `Float32Array`s. The model normalizes
 * each segment internally, so we feed raw audio and never touch levels here.
 *
 * Runs on the CPU execution provider: CoreML compiles this graph but crashes
 * during inference, so we prefer reliability over the GPU speedup.
 */

/** Input tensor name verified against the published model (also its default). */
const INPUT_NAME = "mix";
/** Output tensor name verified against the published model. */
const OUTPUT_NAME = "stems";

function pickTensorName(
  available: readonly string[],
  preferred: string
): string {
  return available.includes(preferred) ? preferred : available[0];
}

async function createSession(modelPath: string): Promise<InferenceSession> {
  // CPU execution provider only. CoreML compiles this htdemucs graph (its
  // GetCapability partitions ~1200 of 1453 nodes) but crashes the utility
  // process during inference, so we trade some speed for reliability.
  // The CPU mem arena caches large per-run allocations across segments and
  // pushes RSS past 4 GB; disabling it keeps peak memory in check.
  return await InferenceSession.create(modelPath, {
    enableCpuMemArena: false,
    enableMemPattern: false,
    executionProviders: ["cpu"],
    graphOptimizationLevel: "all",
  });
}

function toStereo(channels: Float32Array[]): Float32Array[] {
  if (channels.length === 0) {
    throw new Error("mix.wav has no audio channels.");
  }
  if (channels.length === 1) {
    return [channels[0], channels[0]];
  }
  return channels.slice(0, N_CHANNELS);
}

/** Run a single htdemucs model over the mix, returning all four stems. */
async function runModel(
  mix: Float32Array[],
  modelPath: string,
  onProgress?: (fraction: number) => void
): Promise<Float32Array[][]> {
  const session = await createSession(modelPath);
  try {
    const inputName = pickTensorName(session.inputNames, INPUT_NAME);
    const outputName = pickTensorName(session.outputNames, OUTPUT_NAME);
    const window = makeTransitionWindow(N_SAMPLES);

    const runSegment = async (
      mixSegment: Float32Array
    ): Promise<Float32Array> => {
      const input = new Tensor("float32", mixSegment, [
        1,
        N_CHANNELS,
        N_SAMPLES,
      ]);
      const outputs = await session.run({ [inputName]: input });
      return outputs[outputName].data as Float32Array;
    };

    return await weightedOverlapAdd({
      mix,
      nStems: SOURCES.length,
      onSegment: (done, total) => onProgress?.(done / total),
      runSegment,
      segment: N_SAMPLES,
      stride: STRIDE,
      window,
    });
  } finally {
    await session.release();
  }
}

/**
 * Separate `channels` (planar, 44.1 kHz) into stems. `onProgress` receives a
 * 0..1 fraction as work completes. Returns `stems[i][channel]` where `i`
 * indexes {@link SOURCES}.
 *
 * A single `modelPath` runs one model and returns its four stems. The `best`
 * quality passes four fine-tuned specialists (in {@link SOURCES} order); each
 * is run and contributes only its own target stem — the htdemucs_ft "bag".
 */
export async function separateMix(
  channels: Float32Array[],
  modelPaths: string[],
  onProgress?: (fraction: number) => void
): Promise<Float32Array[][]> {
  const mix = toStereo(channels);

  if (modelPaths.length === 1) {
    return await runModel(mix, modelPaths[0], onProgress);
  }

  const stems: Float32Array[][] = new Array(SOURCES.length);
  for (let i = 0; i < modelPaths.length; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: specialists run sequentially to cap memory
    const modelStems = await runModel(mix, modelPaths[i], (fraction) =>
      onProgress?.((i + fraction) / modelPaths.length)
    );
    stems[i] = modelStems[i];
  }
  return stems;
}

/** Sum several planar stems sample-wise into one planar stem. */
export function sumStems(stems: Float32Array[][]): Float32Array[] {
  const [first] = stems;
  const numChannels = first.length;
  const totalLen = first[0].length;
  const summed = Array.from(
    { length: numChannels },
    () => new Float32Array(totalLen)
  );
  for (const stem of stems) {
    for (let ch = 0; ch < numChannels; ch += 1) {
      const source = stem[ch];
      const target = summed[ch];
      for (let i = 0; i < totalLen; i += 1) {
        target[i] += source[i];
      }
    }
  }
  return summed;
}
