import { electronAPI } from "@electron-toolkit/preload";
import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import { IpcChannel, type SocrashApi } from "../shared/ipc";
import type { JobProgress, MigrationProgress, Song } from "../shared/types";

const api: SocrashApi = {
  addSong: (ytUrl) => ipcRenderer.invoke(IpcChannel.AddSong, ytUrl),
  chooseDataDir: () => ipcRenderer.invoke(IpcChannel.ChooseDataDir),
  getAppInfo: () => ipcRenderer.invoke(IpcChannel.GetAppInfo),
  getSettings: () => ipcRenderer.invoke(IpcChannel.GetSettings),
  isMigrating: () => ipcRenderer.invoke(IpcChannel.IsMigrating),
  listSongs: () => ipcRenderer.invoke(IpcChannel.ListSongs),
  moveDataDir: (dest) => ipcRenderer.invoke(IpcChannel.MoveDataDir, dest),
  onJobProgress: (cb) => {
    const listener = (_event: IpcRendererEvent, progress: JobProgress) =>
      cb(progress);
    ipcRenderer.on(IpcChannel.JobProgress, listener);
    return () => ipcRenderer.removeListener(IpcChannel.JobProgress, listener);
  },
  onMigrationProgress: (callback) => {
    const listener = (_event: IpcRendererEvent, progress: MigrationProgress) =>
      callback(progress);
    ipcRenderer.on(IpcChannel.MigrationProgress, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannel.MigrationProgress, listener);
    };
  },
  onSongUpdate: (cb) => {
    const listener = (_event: IpcRendererEvent, song: Song) => cb(song);
    ipcRenderer.on(IpcChannel.SongUpdate, listener);
    return () => ipcRenderer.removeListener(IpcChannel.SongUpdate, listener);
  },
  removeSong: (id) => ipcRenderer.invoke(IpcChannel.RemoveSong, id),
  resolveYouTubeMeta: (url) =>
    ipcRenderer.invoke(IpcChannel.ResolveYouTubeMeta, url),
  retrySong: (id) => ipcRenderer.invoke(IpcChannel.RetrySong, id),
  setSettings: (patch) => ipcRenderer.invoke(IpcChannel.SetSettings, patch),
  validateDataDir: (dest) =>
    ipcRenderer.invoke(IpcChannel.ValidateDataDir, dest),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-expect-error contextIsolation disabled fallback
  window.electron = electronAPI;
  // @ts-expect-error contextIsolation disabled fallback
  window.api = api;
}
