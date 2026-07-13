import type {
  MetronomeWorkerRequest,
  MetronomeWorkerResponse,
} from "./metronome-worker";
import MetronomeWorker from "./metronome-worker?worker";

/**
 * Synthesizes a beat-tracked metronome track for the player (issue: third
 * audio track). Beat times come from running `music-tempo` over the drums
 * stem in a worker (see `metronome-worker.ts`); this module turns those times
 * into an `AudioBuffer` of short percussive clicks that plays phase-locked
 * alongside drums/rest, and never blocks or throws — detection failures just
 * yield a silent (beat-less) track.
 */

/** Duration of a single click, in seconds. */
const CLICK_DURATION_SEC = 0.05;
/** Pitch of the click tone. */
const CLICK_FREQUENCY_HZ = 1000;
/** Peak amplitude of a click before the track's own gain is applied. */
const CLICK_AMPLITUDE = 0.9;
/** Exponential decay rate; higher reads as a sharper "tick" than a tone. */
const CLICK_DECAY_RATE = 40;

/**
 * Average an `AudioBuffer`'s channels down to mono for beat detection. Beat
 * tracking only needs rhythmic content, not stereo imaging.
 */
export function toMonoFromBuffer(buffer: AudioBuffer): Float32Array {
  const { numberOfChannels, length } = buffer;
  if (numberOfChannels === 1) {
    return buffer.getChannelData(0);
  }
  const mono = new Float32Array(length);
  for (let channel = 0; channel < numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      mono[i] += data[i];
    }
  }
  for (let i = 0; i < length; i += 1) {
    mono[i] /= numberOfChannels;
  }
  return mono;
}

/**
 * Run beat detection in a worker so a multi-minute song doesn't jank song
 * load on the main thread. Resolves to `[]` (rather than rejecting) on any
 * failure — a worker crash, an unsupported/silent track, or a detection
 * error — so the metronome track is simply silent instead of breaking
 * playback.
 */
export function detectBeats(
  mono: Float32Array,
  sampleRate: number
): Promise<number[]> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new MetronomeWorker();
    } catch {
      resolve([]);
      return;
    }

    const finish = (beats: number[]) => {
      worker.terminate();
      resolve(beats);
    };

    worker.onmessage = (event: MessageEvent<MetronomeWorkerResponse>) => {
      finish(event.data.type === "beats" ? event.data.beats : []);
    };
    worker.onerror = () => finish([]);

    const request: MetronomeWorkerRequest = { channelData: mono, sampleRate };
    // Transfer the buffer instead of cloning it — `mono` isn't needed after
    // this call and the array can be several megabytes for a full song.
    worker.postMessage(request, [mono.buffer]);
  });
}

/**
 * Convert beat times (seconds) to deduplicated, in-range, ascending sample
 * indices. Pulled out as a pure function so click placement is unit
 * testable without an `AudioContext`.
 */
export function beatsToSampleIndices(
  beats: number[],
  sampleRate: number,
  totalSamples: number
): number[] {
  const indices = new Set<number>();
  for (const beat of beats) {
    if (!Number.isFinite(beat) || beat < 0) {
      continue;
    }
    const index = Math.round(beat * sampleRate);
    if (index >= 0 && index < totalSamples) {
      indices.add(index);
    }
  }
  return Array.from(indices).sort((a, b) => a - b);
}

/** Write one decaying click in-place into `data`, starting at `startSample`. */
function writeClick(
  data: Float32Array,
  startSample: number,
  sampleRate: number
): void {
  const clickSamples = Math.round(CLICK_DURATION_SEC * sampleRate);
  const end = Math.min(data.length, startSample + clickSamples);
  for (let i = Math.max(0, startSample); i < end; i += 1) {
    const t = (i - startSample) / sampleRate;
    const envelope = Math.exp(-CLICK_DECAY_RATE * t);
    data[i] +=
      Math.sin(2 * Math.PI * CLICK_FREQUENCY_HZ * t) *
      envelope *
      CLICK_AMPLITUDE;
  }
}

/**
 * Build a mono click-track `AudioBuffer` spanning `durationSec`, with one
 * click per detected beat. Matches the song's duration so it can start
 * alongside the drums/rest sources with the same offset and stay
 * phase-locked forever, exactly like the existing two tracks.
 */
export function buildClickTrack(
  ctx: AudioContext,
  beats: number[],
  durationSec: number
): AudioBuffer {
  const { sampleRate } = ctx;
  const totalSamples = Math.max(1, Math.ceil(durationSec * sampleRate));
  const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
  const data = buffer.getChannelData(0);
  for (const index of beatsToSampleIndices(beats, sampleRate, totalSamples)) {
    writeClick(data, index, sampleRate);
  }
  return buffer;
}
