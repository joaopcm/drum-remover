import { electronAPI } from "@electron-toolkit/preload";
import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import { IpcChannel, type SocrashApi } from "../shared/ipc";
import type {
  JobProgress,
  MigrationProgress,
  ModelDownloadProgress,
  Song,
  UpdateDownloadProgress,
  UpdateInfo,
} from "../shared/types";

const api: SocrashApi = {
  addSong: (ytUrl) => ipcRenderer.invoke(IpcChannel.AddSong, ytUrl),
  cancelModelDownload: () => ipcRenderer.invoke(IpcChannel.CancelModelDownload),
  cancelUpdate: () => ipcRenderer.invoke(IpcChannel.CancelUpdate),
  checkForUpdate: () => ipcRenderer.invoke(IpcChannel.CheckForUpdate),
  chooseDataDir: () => ipcRenderer.invoke(IpcChannel.ChooseDataDir),
  downloadModel: (quality) =>
    ipcRenderer.invoke(IpcChannel.DownloadModel, quality),
  getAppInfo: () => ipcRenderer.invoke(IpcChannel.GetAppInfo),
  getModelStatuses: () => ipcRenderer.invoke(IpcChannel.GetModelStatuses),
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
  onModelDownloadProgress: (callback) => {
    const listener = (
      _event: IpcRendererEvent,
      progress: ModelDownloadProgress
    ) => callback(progress);
    ipcRenderer.on(IpcChannel.ModelDownloadProgress, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannel.ModelDownloadProgress, listener);
    };
  },
  onSongUpdate: (cb) => {
    const listener = (_event: IpcRendererEvent, song: Song) => cb(song);
    ipcRenderer.on(IpcChannel.SongUpdate, listener);
    return () => ipcRenderer.removeListener(IpcChannel.SongUpdate, listener);
  },
  onUpdateAvailable: (cb) => {
    const listener = (_event: IpcRendererEvent, info: UpdateInfo) => cb(info);
    ipcRenderer.on(IpcChannel.UpdateAvailable, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannel.UpdateAvailable, listener);
    };
  },
  onUpdateDownloadProgress: (cb) => {
    const listener = (
      _event: IpcRendererEvent,
      progress: UpdateDownloadProgress
    ) => cb(progress);
    ipcRenderer.on(IpcChannel.UpdateDownloadProgress, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannel.UpdateDownloadProgress, listener);
    };
  },
  removeSong: (id) => ipcRenderer.invoke(IpcChannel.RemoveSong, id),
  resolveYouTubeMeta: (url) =>
    ipcRenderer.invoke(IpcChannel.ResolveYouTubeMeta, url),
  retrySong: (id) => ipcRenderer.invoke(IpcChannel.RetrySong, id),
  setSettings: (patch) => ipcRenderer.invoke(IpcChannel.SetSettings, patch),
  startUpdate: (info) => ipcRenderer.invoke(IpcChannel.StartUpdate, info),
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
