import { describe, expect, it } from "vitest";
import type { Song, SongStatus } from "../shared/types";
import { computeLaunchReset, pickNextSong } from "./queue-logic";

function song(id: string, status: SongStatus, createdAt: number): Song {
  return {
    author: null,
    createdAt,
    durationSec: null,
    error: null,
    id,
    status,
    thumbnailUrl: null,
    title: id,
    ytUrl: `https://youtu.be/${id}`,
  };
}

describe("pickNextSong", () => {
  it("returns null when nothing is queued", () => {
    expect(pickNextSong([])).toBeNull();
    expect(
      pickNextSong([song("a", "ready", 1), song("b", "separating", 2)])
    ).toBeNull();
  });

  it("picks the oldest queued song (FIFO by createdAt)", () => {
    // Library stores newest-first, so array order is not FIFO order.
    const songs = [
      song("newest", "queued", 300),
      song("oldest", "queued", 100),
      song("middle", "queued", 200),
    ];
    expect(pickNextSong(songs)?.id).toBe("oldest");
  });

  it("ignores songs that are not queued", () => {
    const songs = [
      song("downloading", "downloading", 50),
      song("queued", "queued", 100),
    ];
    expect(pickNextSong(songs)?.id).toBe("queued");
  });
});

describe("computeLaunchReset", () => {
  const noMix = () => false;

  it("resets an interrupted download back to queued", () => {
    const [result] = computeLaunchReset([song("a", "downloading", 1)], noMix);
    expect(result.status).toBe("queued");
    expect(result.error).toBeNull();
  });

  it("clears a stale error message when re-queuing", () => {
    const stuck: Song = { ...song("a", "downloading", 1), error: "boom" };
    const [result] = computeLaunchReset([stuck], noMix);
    expect(result.error).toBeNull();
  });

  it("keeps a separating song when its mix.wav exists (issue #4 handoff)", () => {
    const hasMix = (id: string) => id === "done";
    const [result] = computeLaunchReset(
      [song("done", "separating", 1)],
      hasMix
    );
    expect(result.status).toBe("separating");
  });

  it("re-queues a separating song when its mix.wav is missing", () => {
    const [result] = computeLaunchReset([song("gone", "separating", 1)], noMix);
    expect(result.status).toBe("queued");
  });

  it("leaves resting statuses untouched", () => {
    const songs = [
      song("ready", "ready", 1),
      song("error", "error", 2),
      song("queued", "queued", 3),
    ];
    const result = computeLaunchReset(songs, noMix);
    expect(result.map((s) => s.status)).toEqual(["ready", "error", "queued"]);
  });
});
