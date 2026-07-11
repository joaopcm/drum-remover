import type {
  AppInfo,
  JobProgress,
  Settings,
  Song,
  YouTubeMeta,
} from "./types";

/**
 * IPC channel names. Kept as string constants so main and preload can never
 * drift apart. Later issues extend this map (queue events, etc.).
 */
export const IpcChannel = {
  AddSong: "songs:add",
  GetAppInfo: "app:get-info",
  GetSettings: "settings:get",
  /** main→renderer push: fine-grained job progress ({songId, stage, pct}). */
  JobProgress: "job:progress",
  ListSongs: "songs:list",
  RemoveSong: "songs:remove",
  ResolveYouTubeMeta: "youtube:resolve-meta",
  /** Re-enqueue a failed song for processing. */
  RetrySong: "songs:retry",
  /** main→renderer push: a song's persisted state changed. */
  SongUpdate: "song:update",
} as const;

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];

/**
 * The typed surface exposed to the renderer as `window.api`. Every method is
 * async and backed by a matching `ipcMain.handle` in the main process.
 */
export interface SocrashApi {
  /** Add a song to the library in `queued` status. Rejects on invalid/duplicate URLs. */
  addSong: (ytUrl: string) => Promise<Song>;
  getAppInfo: () => Promise<AppInfo>;
  getSettings: () => Promise<Settings>;
  listSongs: () => Promise<Song[]>;
  /**
   * Subscribe to fine-grained job progress pushed from main while a song is
   * processing. Returns an unsubscribe function.
   */
  onJobProgress: (cb: (progress: JobProgress) => void) => () => void;
  /**
   * Subscribe to song state changes pushed from main (status/duration/error).
   * Returns an unsubscribe function.
   */
  onSongUpdate: (cb: (song: Song) => void) => () => void;
  removeSong: (id: string) => Promise<void>;
  /** Resolve title + thumbnail for the add-song preview. Rejects on bad URLs. */
  resolveYouTubeMeta: (url: string) => Promise<YouTubeMeta>;
  /** Re-enqueue a song that previously failed. */
  retrySong: (id: string) => Promise<void>;
}
