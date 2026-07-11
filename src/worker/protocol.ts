import type { JobProgress, ModelQuality } from "../shared/types";

/**
 * Message protocol between the main process and the pipeline worker running in
 * an Electron `utilityProcess`. Shared by `src/main/queue.ts` and
 * `src/worker/index.ts` so the two sides can never drift.
 *
 * A job is one of two kinds: `download` (fetch + transcode a song to
 * `mix.wav`) or `separate` (split `mix.wav` into stems). The queue runs them
 * as separate forks so each song flows `queued → downloading → separating →
 * ready`.
 */

/** Download + transcode a song to `<dataDir>/songs/<id>/mix.wav`. */
export interface DownloadJobConfig {
  /** Absolute path to the ffmpeg binary (from `ffmpeg-static`). */
  ffmpegPath: string;
  kind: "download";
  /** Destination WAV: `<dataDir>/songs/<id>/mix.wav`. */
  mixPath: string;
  /** Destination download: `<dataDir>/songs/<id>/original.m4a`. */
  originalPath: string;
  songId: string;
  /** Absolute path to the provisioned yt-dlp binary. */
  ytdlpPath: string;
  ytUrl: string;
}

/** Separate `mix.wav` into `drums.wav` + `rest.wav` and write `peaks.json`. */
export interface SeparateJobConfig {
  /** Destination: `<dataDir>/songs/<id>/drums.wav`. */
  drumsPath: string;
  kind: "separate";
  /** Source WAV to read: `<dataDir>/songs/<id>/mix.wav`. */
  mixPath: string;
  /**
   * Provisioned ONNX model files to run, in drums/bass/other/vocals order. One
   * entry for single-model qualities; four specialists for the `best` bag.
   */
  modelPaths: string[];
  /** Original download to delete on success. */
  originalPath: string;
  /** Destination: `<dataDir>/songs/<id>/peaks.json`. */
  peaksPath: string;
  /** Which model quality is being run (for diagnostics). */
  quality: ModelQuality;
  /** Destination: `<dataDir>/songs/<id>/rest.wav`. */
  restPath: string;
  songId: string;
}

/** Everything the worker needs to process one song. Sent by main on fork. */
export type WorkerJobConfig = DownloadJobConfig | SeparateJobConfig;

/** Messages the worker posts back to main. */
export type WorkerMessage =
  | { type: "progress"; progress: JobProgress }
  | { type: "done"; songId: string; durationSec: number | null }
  | { type: "error"; songId: string; message: string };
