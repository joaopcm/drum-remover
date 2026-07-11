/**
 * Convention for the custom `app://` protocol that serves a song's on-disk
 * stems to the renderer. The default `file://` scheme is blocked by the
 * renderer's CSP and Electron's security model, so the main process registers
 * `app://` (see `src/main/index.ts`) and maps requests to `<dataDir>/songs/…`.
 *
 * Shared here so the renderer builds URLs and the main process parses them from
 * a single source of truth.
 */

/** Scheme registered as privileged in the main process. */
export const APP_PROTOCOL = "app";

/**
 * Fixed host segment. `app://` is a "standard" scheme, so a host is required;
 * the real routing lives entirely in the path.
 */
export const APP_ASSET_HOST = "local";

/** Path prefix (under the host) for per-song asset files. */
export const SONGS_PATH_SEGMENT = "songs";

/** Build the `app://` URL the renderer fetches for one of a song's files. */
export function songAssetUrl(songId: string, file: string): string {
  return `${APP_PROTOCOL}://${APP_ASSET_HOST}/${SONGS_PATH_SEGMENT}/${encodeURIComponent(
    songId
  )}/${file}`;
}

/** The three files that make up a playable song on disk. */
export const SONG_FILES = {
  drums: "drums.wav",
  peaks: "peaks.json",
  rest: "rest.wav",
} as const;
