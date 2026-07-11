import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Song } from "../../shared/types";

interface LibraryFile {
  songs: Song[];
  version: 1;
}

/** Fields needed to create a library entry (already resolved from YouTube). */
export interface NewSongInput {
  author: string | null;
  thumbnailUrl: string | null;
  title: string;
  ytUrl: string;
}

export function libraryPath(dataDir: string): string {
  return join(dataDir, "library.json");
}

export function songDir(dataDir: string, songId: string): string {
  return join(dataDir, "songs", songId);
}

/**
 * Serialize all writes per data directory. The main process is single
 * threaded, but individual store operations interleave `await`s, so we chain
 * them to prevent read-modify-write races.
 */
const locks = new Map<string, Promise<unknown>>();

function withLock<T>(dataDir: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(dataDir) ?? Promise.resolve();
  const next = previous.then(task, task);
  locks.set(
    dataDir,
    next.catch(() => {
      // Swallow here so one failed op doesn't poison the chain; callers still
      // receive the rejection via the returned promise below.
    })
  );
  return next;
}

export async function readLibrary(dataDir: string): Promise<Song[]> {
  try {
    const raw = await readFile(libraryPath(dataDir), "utf8");
    const parsed = JSON.parse(raw) as LibraryFile;
    return Array.isArray(parsed.songs) ? parsed.songs : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

async function writeLibrary(dataDir: string, songs: Song[]): Promise<void> {
  const target = libraryPath(dataDir);
  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.${randomUUID()}.tmp`;
  const file: LibraryFile = { songs, version: 1 };
  await writeFile(tmp, JSON.stringify(file, null, 2), "utf8");
  await rename(tmp, target);
}

export function listSongs(dataDir: string): Promise<Song[]> {
  return readLibrary(dataDir);
}

/** Add a song in `queued` status. Rejects if the URL is already present. */
export function addSong(dataDir: string, input: NewSongInput): Promise<Song> {
  return withLock(dataDir, async () => {
    const songs = await readLibrary(dataDir);
    if (songs.some((s) => s.ytUrl === input.ytUrl)) {
      throw new Error("That song is already in your library.");
    }
    const song: Song = {
      author: input.author,
      createdAt: Date.now(),
      durationSec: null,
      error: null,
      id: randomUUID(),
      status: "queued",
      thumbnailUrl: input.thumbnailUrl,
      title: input.title,
      ytUrl: input.ytUrl,
    };
    await writeLibrary(dataDir, [song, ...songs]);
    return song;
  });
}

/** Remove a song and best-effort delete its on-disk folder. */
export function removeSong(dataDir: string, id: string): Promise<void> {
  return withLock(dataDir, async () => {
    const songs = await readLibrary(dataDir);
    await writeLibrary(
      dataDir,
      songs.filter((s) => s.id !== id)
    );
    await rm(songDir(dataDir, id), { force: true, recursive: true });
  });
}
