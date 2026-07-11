import { electronAPI } from "@electron-toolkit/preload";
import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import { IpcChannel, type SocrashApi } from "../shared/ipc";
import type { JobProgress, Song } from "../shared/types";

const api: SocrashApi = {
  addSong: (ytUrl) => ipcRenderer.invoke(IpcChannel.AddSong, ytUrl),
  getAppInfo: () => ipcRenderer.invoke(IpcChannel.GetAppInfo),
  getSettings: () => ipcRenderer.invoke(IpcChannel.GetSettings),
  listSongs: () => ipcRenderer.invoke(IpcChannel.ListSongs),
  onJobProgress: (cb) => {
    const listener = (_event: IpcRendererEvent, progress: JobProgress) =>
      cb(progress);
    ipcRenderer.on(IpcChannel.JobProgress, listener);
    return () => ipcRenderer.removeListener(IpcChannel.JobProgress, listener);
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
