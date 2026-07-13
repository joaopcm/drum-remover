import type { Song } from "@shared/types";

/**
 * Renderer-local bridge for "a song was just added". The add-song dialog is
 * mounted once at the app root so ⌘N works from any view; the library listens
 * for this event to prepend the new row immediately instead of waiting on the
 * first IPC progress push.
 */
export const SONG_ADDED_EVENT = "socrash:song-added";

export function emitSongAdded(song: Song): void {
  window.dispatchEvent(
    new CustomEvent<Song>(SONG_ADDED_EVENT, { detail: song })
  );
}

export function onSongAdded(handler: (song: Song) => void): () => void {
  const listener = (event: Event): void => {
    handler((event as CustomEvent<Song>).detail);
  };
  window.addEventListener(SONG_ADDED_EVENT, listener);
  return () => window.removeEventListener(SONG_ADDED_EVENT, listener);
}
