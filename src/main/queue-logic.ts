import type { Song } from "../shared/types";

/**
 * Pure, side-effect-free helpers for the job queue. Kept separate from
 * `queue.ts` (which imports Electron and spawns processes) so the scheduling
 * rules can be unit-tested in a plain Node environment.
 */

/**
 * Statuses that represent work in progress. A song only reaches these while a
 * job is actively running, so finding one at launch means the previous session
 * was interrupted (crash / force-quit).
 */
export const IN_FLIGHT_STATUSES: readonly Song["status"][] = [
  "downloading",
  "separating",
];

/**
 * Pick the next song a FIFO queue should process: the oldest song still in
 * `queued`. The library stores songs newest-first, so we compare `createdAt`
 * rather than array position. Returns `null` when nothing is waiting.
 */
export function pickNextSong(songs: readonly Song[]): Song | null {
  let next: Song | null = null;
  for (const song of songs) {
    if (song.status !== "queued") {
      continue;
    }
    if (next === null || song.createdAt < next.createdAt) {
      next = song;
    }
  }
  return next;
}

/**
 * Compute the library state after a launch-time recovery pass.
 *
 * A song caught mid-`downloading` was interrupted and must restart, so it is
 * reset to `queued`. A song in `separating` is the handoff state for issue #4:
 * it is only genuinely stuck (and reset to `queued`) when its `mix.wav` is
 * missing; if the WAV exists it is a valid, completed download awaiting the
 * separation engine and is left untouched.
 *
 * `hasMix(songId)` reports whether `<dataDir>/songs/<id>/mix.wav` exists; it is
 * injected so this function stays pure and testable.
 */
export function computeLaunchReset(
  songs: readonly Song[],
  hasMix: (songId: string) => boolean
): Song[] {
  return songs.map((song) => {
    if (song.status === "downloading") {
      return { ...song, error: null, status: "queued" };
    }
    if (song.status === "separating" && !hasMix(song.id)) {
      return { ...song, error: null, status: "queued" };
    }
    return song;
  });
}
