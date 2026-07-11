import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addSong, listSongs, readLibrary, removeSong } from "./library";

let dataDir: string;

const sample = {
  author: "Someone",
  thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  title: "Example",
  ytUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
};

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "socrash-lib-"));
});

afterEach(async () => {
  await rm(dataDir, { force: true, recursive: true });
});

describe("library store", () => {
  it("returns an empty list when no library file exists", async () => {
    expect(await listSongs(dataDir)).toEqual([]);
  });

  it("adds a song in queued status and persists it", async () => {
    const song = await addSong(dataDir, sample);
    expect(song.status).toBe("queued");
    expect(song.id).toBeTruthy();

    const reloaded = await readLibrary(dataDir);
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].ytUrl).toBe(sample.ytUrl);
  });

  it("rejects duplicate URLs", async () => {
    await addSong(dataDir, sample);
    await expect(addSong(dataDir, sample)).rejects.toThrow("already");
    expect(await listSongs(dataDir)).toHaveLength(1);
  });

  it("removes a song by id", async () => {
    const a = await addSong(dataDir, sample);
    const b = await addSong(dataDir, {
      ...sample,
      ytUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    });
    await removeSong(dataDir, a.id);
    const remaining = await listSongs(dataDir);
    expect(remaining.map((s) => s.id)).toEqual([b.id]);
  });

  it("serializes concurrent adds without losing writes", async () => {
    await Promise.all([
      addSong(dataDir, { ...sample, ytUrl: "https://youtu.be/aaaaaaaaaaa" }),
      addSong(dataDir, { ...sample, ytUrl: "https://youtu.be/bbbbbbbbbbb" }),
      addSong(dataDir, { ...sample, ytUrl: "https://youtu.be/ccccccccccc" }),
    ]);
    expect(await listSongs(dataDir)).toHaveLength(3);
  });
});
