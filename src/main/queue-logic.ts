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

/** The kind of work a picked song needs next. */
export type JobKind = "download" | "separate";

/** A song paired with the job it should run next. */
export interface NextJob {
  kind: JobKind;
  song: Song;
}

/**
 * Pick the next job across both pipeline stages, FIFO by `createdAt`. A
 * `queued` song needs a `download`; a `separating` song whose `mix.wav` is
 * already on disk needs a `separate` (this covers both the normal handoff from
 * the download stage and resuming a separation interrupted by a crash). Songs
 * in any other state, or `separating` without a `mix.wav`, are skipped.
 */
export function pickNextJob(
  songs: readonly Song[],
  hasMix: (songId: string) => boolean
): NextJob | null {
  let best: NextJob | null = null;
  for (const song of songs) {
    let kind: JobKind | null = null;
    if (song.status === "queued") {
      kind = "download";
    } else if (song.status === "separating" && hasMix(song.id)) {
      kind = "separate";
    }
    if (kind === null) {
      continue;
    }
    if (best === null || song.createdAt < best.song.createdAt) {
      best = { kind, song };
    }
  }
  return best;
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
