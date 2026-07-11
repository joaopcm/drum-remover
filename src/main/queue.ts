import { existsSync } from "node:fs";
import { join, sep } from "node:path";
import { utilityProcess } from "electron";
import ffmpegStatic from "ffmpeg-static";
import type { JobProgress, ModelQuality, Song } from "../shared/types";
import type { WorkerJobConfig, WorkerMessage } from "../worker/protocol";
import { ensureModel } from "./provision/models";
import { ensureYtdlp } from "./provision/ytdlp";
import { computeLaunchReset, pickNextJob } from "./queue-logic";
import {
  readLibrary,
  type SongPatch,
  songDir,
  updateSong,
} from "./store/library";

/**
 * FIFO job queue. Runs one job at a time in a `utilityProcess` worker,
 * persisting every status transition to the library and broadcasting it to the
 * renderer.
 *
 * A song flows `queued → downloading → separating → ready`. The queue picks up
 * `queued` songs for a download job and `separating` songs (whose `mix.wav` is
 * present) for a separation job, so completion chains automatically and a
 * separation interrupted by a crash resumes on next launch.
 */

const NEWLINE_SPLIT_RE = /\r?\n/;

interface QueueDeps {
  broadcastProgress: (progress: JobProgress) => void;
  broadcastSong: (song: Song) => void;
  dataDir: string;
  modelQuality: ModelQuality;
}

type WorkerResult =
  | { durationSec: number | null; type: "done" }
  | { message: string; type: "error" };

let deps: QueueDeps | null = null;
let running = false;

export function initQueue(next: QueueDeps): void {
  deps = next;
}

/**
 * Update the data dir / model quality the queue uses for future jobs, after the
 * user changes settings. The pump reads these fresh on each cycle, so in-flight
 * jobs finish with their original config and the next job picks up the change.
 */
export function updateQueueConfig(
  patch: Partial<Pick<QueueDeps, "dataDir" | "modelQuality">>
): void {
  if (deps !== null) {
    deps = { ...deps, ...patch };
  }
}

async function setStatus(
  d: QueueDeps,
  id: string,
  patch: SongPatch
): Promise<void> {
  const updated = await updateSong(d.dataDir, id, patch);
  if (updated) {
    d.broadcastSong(updated);
  }
}

/**
 * Fork a worker for `config`, forward progress, and resolve with the terminal
 * result (never both `done` and `error`). An unexpected exit resolves as an
 * error so the caller can mark the song failed.
 */
function runWorker(
  config: WorkerJobConfig,
  d: QueueDeps
): Promise<WorkerResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: WorkerResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    const child = utilityProcess.fork(
      join(import.meta.dirname, "worker.js"),
      [],
      {
        stdio: "pipe",
      }
    );

    // Capture worker output so a native crash (e.g. in onnxruntime) surfaces a
    // useful message instead of a bare exit code. Also mirror it to the main
    // process stderr for `pnpm dev` visibility.
    let captured = "";
    const collect = (chunk: Buffer): void => {
      const text = chunk.toString();
      captured = `${captured}${text}`.slice(-4000);
      process.stderr.write(text);
    };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);

    child.on("message", (msg: WorkerMessage) => {
      if (msg.type === "progress") {
        d.broadcastProgress(msg.progress);
        return;
      }
      if (msg.type === "done") {
        finish({ durationSec: msg.durationSec, type: "done" });
        return;
      }
      finish({ message: msg.message, type: "error" });
    });

    child.on("exit", (code) => {
      const tail = captured
        .split(NEWLINE_SPLIT_RE)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(-2)
        .join(" — ");
      finish({
        message: tail
          ? `Worker crashed (code ${code}): ${tail}`.slice(0, 300)
          : `Worker exited unexpectedly (code ${code}).`,
        type: "error",
      });
    });

    child.postMessage(config);
  });
}

async function processDownload(d: QueueDeps, song: Song): Promise<void> {
  await setStatus(d, song.id, { error: null, status: "downloading" });
  d.broadcastProgress({ pct: 0, songId: song.id, stage: "provisioning" });

  try {
    const ytdlpBin = await ensureYtdlp(d.dataDir, (pct) =>
      d.broadcastProgress({ pct, songId: song.id, stage: "provisioning" })
    );
    if (!ffmpegStatic) {
      throw new Error("Bundled ffmpeg binary is missing.");
    }
    // In a packaged build the binary is unpacked next to the asar; the path
    // baked in by ffmpeg-static still points inside app.asar (a no-op in dev).
    const ffmpegPath = ffmpegStatic.replace(
      `app.asar${sep}`,
      `app.asar.unpacked${sep}`
    );
    const dir = songDir(d.dataDir, song.id);
    const result = await runWorker(
      {
        ffmpegPath,
        kind: "download",
        mixPath: join(dir, "mix.wav"),
        originalPath: join(dir, "original.m4a"),
        songId: song.id,
        ytdlpPath: ytdlpBin,
        ytUrl: song.ytUrl,
      },
      d
    );
    if (result.type === "error") {
      await setStatus(d, song.id, { error: result.message, status: "error" });
      return;
    }
    await setStatus(d, song.id, {
      durationSec: result.durationSec,
      error: null,
      status: "separating",
    });
  } catch (err) {
    await setStatus(d, song.id, {
      error: err instanceof Error ? err.message : "Download failed.",
      status: "error",
    });
  }
}

async function processSeparate(d: QueueDeps, song: Song): Promise<void> {
  d.broadcastProgress({ pct: 0, songId: song.id, stage: "provisioning" });

  try {
    const modelPaths = await ensureModel(
      d.dataDir,
      d.modelQuality,
      (fraction) =>
        d.broadcastProgress({
          pct: fraction * 100,
          songId: song.id,
          stage: "provisioning",
        })
    );
    const dir = songDir(d.dataDir, song.id);
    const result = await runWorker(
      {
        drumsPath: join(dir, "drums.wav"),
        kind: "separate",
        mixPath: join(dir, "mix.wav"),
        modelPaths,
        originalPath: join(dir, "original.m4a"),
        peaksPath: join(dir, "peaks.json"),
        quality: d.modelQuality,
        restPath: join(dir, "rest.wav"),
        songId: song.id,
      },
      d
    );
    if (result.type === "error") {
      await setStatus(d, song.id, { error: result.message, status: "error" });
      return;
    }
    await setStatus(d, song.id, { error: null, status: "ready" });
  } catch (err) {
    await setStatus(d, song.id, {
      error: err instanceof Error ? err.message : "Separation failed.",
      status: "error",
    });
  }
}

/**
 * Kick the pump. Cheap and idempotent: if a job is already running, or nothing
 * is actionable, it returns without starting anything. Safe to call after every
 * add / retry / job completion.
 */
export function enqueue(): void {
  if (running || deps === null) {
    return;
  }
  running = true;
  const d = deps;
  readLibrary(d.dataDir)
    .then((songs) => {
      const job = pickNextJob(songs, (id) =>
        existsSync(join(songDir(d.dataDir, id), "mix.wav"))
      );
      if (job === null) {
        running = false;
        return;
      }
      const run =
        job.kind === "download"
          ? processDownload(d, job.song)
          : processSeparate(d, job.song);
      return run.finally(() => {
        running = false;
        enqueue();
      });
    })
    .catch(() => {
      running = false;
    });
}

/** Re-enqueue a previously failed song. */
export async function retrySong(id: string): Promise<void> {
  if (deps === null) {
    return;
  }
  await setStatus(deps, id, { error: null, status: "queued" });
  enqueue();
}

/**
 * Launch-time recovery: reset songs interrupted mid-flight back to `queued`
 * (see {@link computeLaunchReset}), then process the backlog.
 */
export async function recoverAndResume(): Promise<void> {
  if (deps === null) {
    return;
  }
  const d = deps;
  const songs = await readLibrary(d.dataDir);
  const reset = computeLaunchReset(songs, (id) =>
    existsSync(join(songDir(d.dataDir, id), "mix.wav"))
  );
  const changed = reset.filter((s, i) => s.status !== songs[i].status);
  await Promise.all(
    changed.map((song) =>
      setStatus(d, song.id, { error: null, status: "queued" })
    )
  );
  enqueue();
}
