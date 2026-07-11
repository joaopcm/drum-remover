import { existsSync } from "node:fs";
import { join } from "node:path";
import { utilityProcess } from "electron";
import ffmpegStatic from "ffmpeg-static";
import type { JobProgress, Song } from "../shared/types";
import type { WorkerJobConfig, WorkerMessage } from "../worker/protocol";
import { ensureYtdlp } from "./provision/ytdlp";
import { computeLaunchReset, pickNextSong } from "./queue-logic";
import {
  readLibrary,
  type SongPatch,
  songDir,
  updateSong,
} from "./store/library";

/**
 * FIFO job queue. Runs one download+transcode job at a time in a
 * `utilityProcess` worker, persisting every status transition to the library
 * and broadcasting it to the renderer.
 *
 * Handoff to issue #4: a completed job leaves the song in `separating` with a
 * `mix.wav` present on disk. The separation engine (issue #4) consumes songs in
 * that state and drives them to `ready`. Nothing is deleted here — cleanup is
 * #4's responsibility.
 */

interface QueueDeps {
  broadcastProgress: (progress: JobProgress) => void;
  broadcastSong: (song: Song) => void;
  dataDir: string;
}

let deps: QueueDeps | null = null;
let running = false;

export function initQueue(next: QueueDeps): void {
  deps = next;
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

function runWorker(config: WorkerJobConfig, d: QueueDeps): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    const child = utilityProcess.fork(join(import.meta.dirname, "worker.js"));

    child.on("message", (msg: WorkerMessage) => {
      if (msg.type === "progress") {
        d.broadcastProgress(msg.progress);
        return;
      }
      if (msg.type === "done") {
        setStatus(d, msg.songId, {
          durationSec: msg.durationSec,
          error: null,
          status: "separating",
        }).finally(finish);
        return;
      }
      setStatus(d, msg.songId, {
        error: msg.message,
        status: "error",
      }).finally(finish);
    });

    child.on("exit", (code) => {
      if (done) {
        return;
      }
      setStatus(d, config.songId, {
        error: `Worker exited unexpectedly (code ${code}).`,
        status: "error",
      }).finally(finish);
    });

    child.postMessage(config);
  });
}

async function processSong(d: QueueDeps, song: Song): Promise<void> {
  await setStatus(d, song.id, { error: null, status: "downloading" });
  d.broadcastProgress({ pct: 0, songId: song.id, stage: "provisioning" });

  try {
    const ytdlpBin = await ensureYtdlp(d.dataDir, (pct) =>
      d.broadcastProgress({ pct, songId: song.id, stage: "provisioning" })
    );
    if (!ffmpegStatic) {
      throw new Error("Bundled ffmpeg binary is missing.");
    }
    const dir = songDir(d.dataDir, song.id);
    await runWorker(
      {
        ffmpegPath: ffmpegStatic,
        mixPath: join(dir, "mix.wav"),
        originalPath: join(dir, "original.m4a"),
        songId: song.id,
        ytdlpPath: ytdlpBin,
        ytUrl: song.ytUrl,
      },
      d
    );
  } catch (err) {
    await setStatus(d, song.id, {
      error: err instanceof Error ? err.message : "Processing failed.",
      status: "error",
    });
  }
}

/**
 * Kick the pump. Cheap and idempotent: if a job is already running, or nothing
 * is queued, it returns without starting anything. Safe to call after every
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
      const next = pickNextSong(songs);
      if (next === null) {
        running = false;
        return;
      }
      return processSong(d, next).finally(() => {
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
