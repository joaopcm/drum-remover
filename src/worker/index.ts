import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { JobStage, PeaksData } from "../shared/types";
import { SAMPLE_RATE } from "./overlap-add";
import { computePeaks, PEAK_BUCKETS, samplesPerBucket, toMono } from "./peaks";
import type {
  DownloadJobConfig,
  SeparateJobConfig,
  WorkerJobConfig,
  WorkerMessage,
} from "./protocol";
import { decodeWav, encodeWav } from "./wav";

/**
 * Pipeline worker. Runs inside an Electron `utilityProcess` (a Node.js child,
 * NOT the main process) so the CPU/IO-heavy download, transcode, and ONNX
 * separation never block windowing or IPC. It receives a single
 * {@link WorkerJobConfig}, streams progress back to main, then reports `done`
 * or `error` and exits.
 *
 * Two job kinds:
 * - `download`: yt-dlp fetches bestaudio → `original.m4a`, ffmpeg transcodes to
 *   44.1 kHz stereo float32 → `mix.wav`.
 * - `separate`: HT-Demucs (ONNX) splits `mix.wav` into `drums.wav` + `rest.wav`
 *   (bass + other + vocals summed), writes `peaks.json`, and deletes the
 *   intermediates.
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

function download(config: DownloadJobConfig): Promise<void> {
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
function convert(config: DownloadJobConfig): Promise<number | null> {
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

async function runDownload(config: DownloadJobConfig): Promise<void> {
  await mkdir(dirname(config.mixPath), { recursive: true });
  reportProgress(config.songId, "downloading", 0);
  await download(config);
  reportProgress(config.songId, "converting", 0);
  const durationSec = await convert(config);
  reportProgress(config.songId, "finalizing", 100);
  post({ durationSec, songId: config.songId, type: "done" });
}

/** Copy the WAV bytes out of the Buffer into a standalone ArrayBuffer. */
function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return copy.buffer;
}

async function runSeparate(config: SeparateJobConfig): Promise<void> {
  reportProgress(config.songId, "separating", 0);
  const buffer = await readFile(config.mixPath);
  const { channels } = decodeWav(toArrayBuffer(buffer));

  // Loaded lazily so download jobs don't pay onnxruntime-node's native init.
  const { separateMix, sumStems } = await import("./separate");
  const stems = await separateMix(channels, config.modelPaths, (fraction) =>
    reportProgress(config.songId, "separating", fraction * 100)
  );

  reportProgress(config.songId, "finalizing", 0);
  const [drums, bass, other, vocals] = stems;
  const rest = sumStems([bass, other, vocals]);
  await writeFile(config.drumsPath, encodeWav(drums, SAMPLE_RATE));
  await writeFile(config.restPath, encodeWav(rest, SAMPLE_RATE));

  const drumsMono = toMono(drums);
  const restMono = toMono(rest);
  const peaks: PeaksData = {
    drums: computePeaks(drumsMono, PEAK_BUCKETS),
    rest: computePeaks(restMono, PEAK_BUCKETS),
    sampleRate: SAMPLE_RATE,
    samplesPerBucket: samplesPerBucket(drumsMono.length, PEAK_BUCKETS),
    version: 1,
  };
  await writeFile(config.peaksPath, JSON.stringify(peaks));

  await rm(config.originalPath, { force: true });
  await rm(config.mixPath, { force: true });
  reportProgress(config.songId, "finalizing", 100);
  post({ durationSec: null, songId: config.songId, type: "done" });
}

function runJob(config: WorkerJobConfig): Promise<void> {
  return config.kind === "download" ? runDownload(config) : runSeparate(config);
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
