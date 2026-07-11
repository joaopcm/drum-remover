/**
 * Domain types shared across the main, preload, and renderer processes.
 * This module is the single source of truth for Socrash's data shapes.
 */

/** Lifecycle of a song as it moves through the processing pipeline. */
export type SongStatus =
  | "queued"
  | "downloading"
  | "separating"
  | "ready"
  | "error";

/** A song in the user's library. */
export interface Song {
  author: string | null;
  createdAt: number;
  durationSec: number | null;
  error: string | null;
  id: string;
  status: SongStatus;
  thumbnailUrl: string | null;
  title: string;
  ytUrl: string;
}

/**
 * Separation quality the user selects in Settings. Each maps to a different
 * htdemucs ONNX model with its own size/speed/quality trade-off.
 */
export type ModelQuality = "fast" | "balanced" | "best";

/** Persisted user settings. `dataDir` is where all song data + models live. */
export interface Settings {
  dataDir: string;
  modelQuality: ModelQuality;
}

/** Fine-grained stage a processing job is currently in. */
export type JobStage =
  | "provisioning"
  | "downloading"
  | "converting"
  | "separating"
  | "finalizing";

/** Progress update emitted while a job runs. */
export interface JobProgress {
  pct: number;
  songId: string;
  stage: JobStage;
}

/**
 * Precomputed waveform peaks for the player (issue #5). Written to
 * `<dataDir>/songs/<id>/peaks.json` by the separation worker and consumed by
 * the renderer to draw the drums/rest waveforms without decoding audio. Each
 * array holds ~2000 peak magnitudes normalized to 0..1, one per bucket.
 */
export interface PeaksData {
  drums: number[];
  rest: number[];
  sampleRate: number;
  samplesPerBucket: number;
  version: 1;
}

/** Progress emitted while the data directory is migrated to a new location. */
export interface MigrationProgress {
  bytesCopied: number;
  totalBytes: number;
}

/**
 * Result of checking a candidate data directory before a move.
 * `ok` is false for hard failures (same dir, nested inside the current dir,
 * unwritable). `nonEmpty` flags destinations that already hold files and thus
 * need explicit user confirmation. `message` explains a hard failure.
 */
export interface DataDirValidation {
  message: string | null;
  nonEmpty: boolean;
  ok: boolean;
}

/** Metadata resolved from a YouTube URL for the add-song preview. */
export interface YouTubeMeta {
  author: string | null;
  thumbnailUrl: string;
  title: string;
  videoId: string;
}

/** Runtime information about the app, surfaced for diagnostics. */
export interface AppInfo {
  chrome: string;
  electron: string;
  name: string;
  node: string;
  platform: string;
  version: string;
}
