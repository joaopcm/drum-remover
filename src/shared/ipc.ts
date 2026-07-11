import type {
  AppInfo,
  DataDirValidation,
  MigrationProgress,
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
  ChooseDataDir: "settings:choose-data-dir",
  GetAppInfo: "app:get-info",
  GetSettings: "settings:get",
  IsMigrating: "settings:is-migrating",
  ListSongs: "songs:list",
  MigrationProgress: "settings:migration-progress",
  MoveDataDir: "settings:move-data-dir",
  RemoveSong: "songs:remove",
  ResolveYouTubeMeta: "youtube:resolve-meta",
  SetSettings: "settings:set",
  ValidateDataDir: "settings:validate-data-dir",
} as const;

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];

/**
 * The typed surface exposed to the renderer as `window.api`. Every method is
 * async and backed by a matching `ipcMain.handle` in the main process.
 */
export interface SocrashApi {
  /** Add a song to the library in `queued` status. Rejects on invalid/duplicate URLs. */
  addSong: (ytUrl: string) => Promise<Song>;
  /** Open a native folder picker for a new data directory. Resolves null if cancelled. */
  chooseDataDir: () => Promise<string | null>;
  getAppInfo: () => Promise<AppInfo>;
  getSettings: () => Promise<Settings>;
  /** Whether a data-directory migration is currently in progress. */
  isMigrating: () => Promise<boolean>;
  listSongs: () => Promise<Song[]>;
  /**
   * Safely migrate all data to `dest` (copy → verify → flip pointer → delete
   * old). Rejects if a move is already running or the destination is invalid.
   */
  moveDataDir: (dest: string) => Promise<Settings>;
  /** Subscribe to migration progress. Returns an unsubscribe function. */
  onMigrationProgress: (
    callback: (progress: MigrationProgress) => void
  ) => () => void;
  removeSong: (id: string) => Promise<void>;
  /** Resolve title + thumbnail for the add-song preview. Rejects on bad URLs. */
  resolveYouTubeMeta: (url: string) => Promise<YouTubeMeta>;
  /** Merge a partial patch into the persisted settings and return the result. */
  setSettings: (patch: Partial<Settings>) => Promise<Settings>;
  /** Check a candidate data directory before moving into it. */
  validateDataDir: (dest: string) => Promise<DataDirValidation>;
}
