import type { JobProgress } from "../shared/types";

/**
 * Message protocol between the main process and the pipeline worker running in
 * an Electron `utilityProcess`. Shared by `src/main/queue.ts` and
 * `src/worker/index.ts` so the two sides can never drift.
 */

/** Everything the worker needs to process one song. Sent by main on fork. */
export interface WorkerJobConfig {
  /** Absolute path to the ffmpeg binary (from `ffmpeg-static`). */
  ffmpegPath: string;
  /** Destination WAV: `<dataDir>/songs/<id>/mix.wav`. */
  mixPath: string;
  /** Destination download: `<dataDir>/songs/<id>/original.m4a`. */
  originalPath: string;
  songId: string;
  /** Absolute path to the provisioned yt-dlp binary. */
  ytdlpPath: string;
  ytUrl: string;
}

/** Messages the worker posts back to main. */
export type WorkerMessage =
  | { type: "progress"; progress: JobProgress }
  | { type: "done"; songId: string; durationSec: number | null }
  | { type: "error"; songId: string; message: string };
