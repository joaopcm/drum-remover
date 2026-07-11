import type {
  AppInfo,
  DataDirValidation,
  JobProgress,
  MigrationProgress,
  ModelDownloadProgress,
  ModelQuality,
  ModelStatus,
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
  CancelModelDownload: "models:cancel",
  ChooseDataDir: "settings:choose-data-dir",
  DownloadModel: "models:download",
  GetAppInfo: "app:get-info",
  GetModelStatuses: "models:statuses",
  GetSettings: "settings:get",
  IsMigrating: "settings:is-migrating",
  /** main→renderer push: fine-grained job progress ({songId, stage, pct}). */
  JobProgress: "job:progress",
  ListSongs: "songs:list",
  MigrationProgress: "settings:migration-progress",
  /** main→renderer push: model download progress ({quality, pct}). */
  ModelDownloadProgress: "models:download-progress",
  MoveDataDir: "settings:move-data-dir",
  RemoveSong: "songs:remove",
  ResolveYouTubeMeta: "youtube:resolve-meta",
  /** Re-enqueue a failed song for processing. */
  RetrySong: "songs:retry",
  SetSettings: "settings:set",
  /** main→renderer push: a song's persisted state changed. */
  SongUpdate: "song:update",
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
  /** Cancel an in-flight model download started by `downloadModel`. */
  cancelModelDownload: () => Promise<void>;
  /** Open a native folder picker for a new data directory. Resolves null if cancelled. */
  chooseDataDir: () => Promise<string | null>;
  /**
   * Download the model for `quality` (if needed) then make it the active
   * separation quality. Progress arrives via `onModelDownloadProgress`.
   * Resolves the updated settings; rejects/aborts leave the choice unchanged.
   */
  downloadModel: (quality: ModelQuality) => Promise<Settings>;
  getAppInfo: () => Promise<AppInfo>;
  /** Download size + local availability for every separation quality. */
  getModelStatuses: () => Promise<ModelStatus[]>;
  getSettings: () => Promise<Settings>;
  /** Whether a data-directory migration is currently in progress. */
  isMigrating: () => Promise<boolean>;
  listSongs: () => Promise<Song[]>;
  /**
   * Safely migrate all data to `dest` (copy → verify → flip pointer → delete
   * old). Rejects if a move is already running or the destination is invalid.
   */
  moveDataDir: (dest: string) => Promise<Settings>;
  /**
   * Subscribe to fine-grained job progress pushed from main while a song is
   * processing. Returns an unsubscribe function.
   */
  onJobProgress: (cb: (progress: JobProgress) => void) => () => void;
  /** Subscribe to migration progress. Returns an unsubscribe function. */
  onMigrationProgress: (
    callback: (progress: MigrationProgress) => void
  ) => () => void;
  /** Subscribe to model download progress. Returns an unsubscribe function. */
  onModelDownloadProgress: (
    callback: (progress: ModelDownloadProgress) => void
  ) => () => void;
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
  /** Merge a partial patch into the persisted settings and return the result. */
  setSettings: (patch: Partial<Settings>) => Promise<Settings>;
  /** Check a candidate data directory before moving into it. */
  validateDataDir: (dest: string) => Promise<DataDirValidation>;
}
