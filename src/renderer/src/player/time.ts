/**
 * Pure time math for the player engine. Keeping it separate from the provider
 * makes the drift-free sync logic unit-testable without a real `AudioContext`.
 */

/** Clamp a target time in seconds to the playable `[0, durationSec]` range. */
export function clampTime(sec: number, durationSec: number): number {
  if (!Number.isFinite(sec) || sec < 0) {
    return 0;
  }
  if (sec > durationSec) {
    return durationSec;
  }
  return sec;
}

/** Inputs describing an in-progress playback, sampled at `nowCtxTime`. */
export interface PositionInput {
  durationSec: number;
  nowCtxTime: number;
  startCtxTime: number;
  startOffsetSec: number;
}

/**
 * Position (seconds) of the playhead given the `AudioContext` clock. Both
 * sources start at the same `startCtxTime` with the same `startOffsetSec`, so a
 * single elapsed calculation tracks them in perfect sync. Result is clamped to
 * the song duration.
 */
export function currentPosition({
  startOffsetSec,
  startCtxTime,
  nowCtxTime,
  durationSec,
}: PositionInput): number {
  const elapsed = nowCtxTime - startCtxTime;
  return clampTime(startOffsetSec + elapsed, durationSec);
}

/** Convert a 0..1 fraction (e.g. a waveform click x) to seconds. */
export function fractionToTime(fraction: number, durationSec: number): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  return clamped * durationSec;
}

/** Convert a time in seconds to a 0..1 fraction of the duration. */
export function timeToFraction(sec: number, durationSec: number): number {
  if (durationSec <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, sec / durationSec));
}

/**
 * Convert a horizontal pixel offset within a progress track of the given width
 * to a time in seconds. Used by the mini-player's click-to-seek bar. A
 * non-positive width means the track hasn't laid out yet, so seek to the start.
 */
export function offsetToTime(
  offsetX: number,
  width: number,
  durationSec: number
): number {
  if (width <= 0) {
    return 0;
  }
  return fractionToTime(offsetX / width, durationSec);
}
