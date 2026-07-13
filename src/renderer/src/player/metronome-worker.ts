import MusicTempo from "music-tempo";

/**
 * Beat detection runs off the main thread: `MusicTempo` walks the entire mono
 * signal synchronously (a multi-minute song is millions of samples), which
 * would otherwise jank the UI during song load. Bundled as its own worker
 * chunk via Vite's `?worker` import in {@link ./metronome.ts}.
 */

export interface MetronomeWorkerRequest {
  channelData: Float32Array;
  sampleRate: number;
}

export type MetronomeWorkerResponse =
  | { type: "beats"; beats: number[] }
  | { type: "error"; message: string };

/**
 * `music-tempo`'s onset detection hop is a raw sample count (default 441)
 * that it then converts to seconds via a `timeStep` default of 0.01 — the
 * two are only consistent at 44.1 kHz (441 / 44100 = 0.01). Our `AudioBuffer`
 * runs at whatever rate the `AudioContext` opened with (often 48 kHz), so we
 * rescale both to the same ~10ms hop at the real sample rate; otherwise beat
 * times would be off by the sample-rate ratio.
 */
const TARGET_HOP_SEC = 0.01;

function tempoParams(sampleRate: number): {
  hopSize: number;
  timeStep: number;
} {
  const hopSize = Math.max(1, Math.round(sampleRate * TARGET_HOP_SEC));
  return { hopSize, timeStep: hopSize / sampleRate };
}

// `self` inside a worker is a `DedicatedWorkerGlobalScope`, but this project's
// tsconfig only pulls in the "DOM" lib (for the renderer), not "webworker" —
// mixing both would conflict. The outward-facing `Worker` interface declares
// the same `postMessage`/`onmessage` shape we need here, so it types this
// file without widening the whole project's lib scope.
const ctx = self as unknown as Worker;

ctx.onmessage = (event: MessageEvent<MetronomeWorkerRequest>) => {
  const { channelData, sampleRate } = event.data;
  try {
    const musicTempo = new MusicTempo(channelData, tempoParams(sampleRate));
    const response: MetronomeWorkerResponse = {
      beats: musicTempo.beats,
      type: "beats",
    };
    ctx.postMessage(response);
  } catch (err) {
    const response: MetronomeWorkerResponse = {
      message: err instanceof Error ? err.message : "Unknown error",
      type: "error",
    };
    ctx.postMessage(response);
  }
};
