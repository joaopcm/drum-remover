import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { JobStage } from "../shared/types";
import type { WorkerJobConfig, WorkerMessage } from "./protocol";

/**
 * Pipeline worker. Runs inside an Electron `utilityProcess` (a Node.js child,
 * NOT the main process) so the CPU/IO-heavy download + transcode never blocks
 * windowing or IPC. It receives a single {@link WorkerJobConfig}, streams
 * progress back to main, then reports `done` (with the extracted duration) or
 * `error` and exits.
 *
 * Pipeline: yt-dlp fetches bestaudio → `original.m4a`, then ffmpeg transcodes
 * to a 44.1 kHz stereo float32 WAV → `mix.wav` (the exact input the separation
 * model in issue #4 expects).
 */

const DOWNLOAD_PCT_RE = /\[download\]\s+([\d.]+)%/;
const FFMPEG_DURATION_RE = /Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/;
const FFMPEG_TIME_RE = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/;
const LINE_SPLIT_RE = /\r?\n/;

function post(message: WorkerMessage): void {
  process.parentPort.postMessage(message);
}

function reportProgress(songId: string, stage: JobStage, pct: number): void {
  post({
    progress: { pct: Math.max(0, Math.min(100, pct)), songId, stage },
    type: "progress",
  });
}

/** Last non-empty line of captured output, for readable error messages. */
function lastLine(text: string): string {
  const lines = text
    .split(LINE_SPLIT_RE)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.at(-1) ?? "";
}

function hmsToSeconds(h: string, m: string, s: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

function download(config: WorkerJobConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ytdlpPath, [
      "--no-playlist",
      "--newline",
      "--no-part",
      "-f",
      "bestaudio[ext=m4a]/bestaudio",
      "-o",
      config.originalPath,
      config.ytUrl,
    ]);
    wireDownload(child, config.songId, resolve, reject);
  });
}

function wireDownload(
  child: ChildProcessWithoutNullStreams,
  songId: string,
  resolve: () => void,
  reject: (err: Error) => void
): void {
  let stderr = "";
  child.stdout.on("data", (buf: Buffer) => {
    const match = buf.toString().match(DOWNLOAD_PCT_RE);
    if (match) {
      reportProgress(songId, "downloading", Number(match[1]));
    }
  });
  child.stderr.on("data", (buf: Buffer) => {
    stderr += buf.toString();
  });
  child.on("error", (err) =>
    reject(new Error(`Could not start yt-dlp: ${err.message}`))
  );
  child.on("close", (code) => {
    if (code === 0) {
      resolve();
      return;
    }
    const detail = lastLine(stderr) || `exited with code ${code}`;
    reject(new Error(`Download failed: ${detail}`));
  });
}

/** Transcode to WAV. Resolves with the media duration in seconds (or null). */
function convert(config: WorkerJobConfig): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ffmpegPath, [
      "-y",
      "-i",
      config.originalPath,
      "-ar",
      "44100",
      "-ac",
      "2",
      "-c:a",
      "pcm_f32le",
      config.mixPath,
    ]);
    wireConvert(child, config.songId, resolve, reject);
  });
}

function wireConvert(
  child: ChildProcessWithoutNullStreams,
  songId: string,
  resolve: (duration: number | null) => void,
  reject: (err: Error) => void
): void {
  let stderr = "";
  let durationSec: number | null = null;
  child.stderr.on("data", (buf: Buffer) => {
    const text = buf.toString();
    stderr += text;
    if (durationSec === null) {
      const dur = text.match(FFMPEG_DURATION_RE);
      if (dur) {
        durationSec = hmsToSeconds(dur[1], dur[2], dur[3]);
      }
    }
    const time = text.match(FFMPEG_TIME_RE);
    if (time && durationSec && durationSec > 0) {
      const elapsed = hmsToSeconds(time[1], time[2], time[3]);
      reportProgress(songId, "converting", (elapsed / durationSec) * 100);
    }
  });
  child.on("error", (err) =>
    reject(new Error(`Could not start ffmpeg: ${err.message}`))
  );
  child.on("close", (code) => {
    if (code === 0) {
      resolve(durationSec === null ? null : Math.round(durationSec));
      return;
    }
    const detail = lastLine(stderr) || `exited with code ${code}`;
    reject(new Error(`Conversion failed: ${detail}`));
  });
}

async function runJob(config: WorkerJobConfig): Promise<void> {
  await mkdir(dirname(config.mixPath), { recursive: true });
  reportProgress(config.songId, "downloading", 0);
  await download(config);
  reportProgress(config.songId, "converting", 0);
  const durationSec = await convert(config);
  reportProgress(config.songId, "finalizing", 100);
  post({ durationSec, songId: config.songId, type: "done" });
}

function handleMessage(config: WorkerJobConfig): void {
  runJob(config)
    .catch((err: unknown) => {
      post({
        message: err instanceof Error ? err.message : "Unknown error",
        songId: config.songId,
        type: "error",
      });
    })
    .finally(() => {
      process.exit(0);
    });
}

process.parentPort.once("message", (event: Electron.MessageEvent) => {
  handleMessage(event.data as WorkerJobConfig);
});
