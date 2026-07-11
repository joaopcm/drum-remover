import type { AppInfo, Settings } from "./types";

/**
 * IPC channel names. Kept as string constants so main and preload can never
 * drift apart. Later issues extend this map (add-song, queue events, etc.).
 */
export const IpcChannel = {
  GetAppInfo: "app:get-info",
  GetSettings: "settings:get",
} as const;

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];

/**
 * The typed surface exposed to the renderer as `window.api`. Every method is
 * async and backed by a matching `ipcMain.handle` in the main process.
 */
export interface SocrashApi {
  getAppInfo: () => Promise<AppInfo>;
  getSettings: () => Promise<Settings>;
}
