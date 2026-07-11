import type { AppInfo, Settings, Song, YouTubeMeta } from "./types";

/**
 * IPC channel names. Kept as string constants so main and preload can never
 * drift apart. Later issues extend this map (queue events, etc.).
 */
export const IpcChannel = {
  AddSong: "songs:add",
  GetAppInfo: "app:get-info",
  GetSettings: "settings:get",
  ListSongs: "songs:list",
  RemoveSong: "songs:remove",
  ResolveYouTubeMeta: "youtube:resolve-meta",
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
  removeSong: (id: string) => Promise<void>;
  /** Resolve title + thumbnail for the add-song preview. Rejects on bad URLs. */
  resolveYouTubeMeta: (url: string) => Promise<YouTubeMeta>;
}
