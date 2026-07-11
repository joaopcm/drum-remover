import { electronAPI } from "@electron-toolkit/preload";
import { contextBridge, ipcRenderer } from "electron";
import { IpcChannel, type SocrashApi } from "../shared/ipc";

const api: SocrashApi = {
  addSong: (ytUrl) => ipcRenderer.invoke(IpcChannel.AddSong, ytUrl),
  getAppInfo: () => ipcRenderer.invoke(IpcChannel.GetAppInfo),
  getSettings: () => ipcRenderer.invoke(IpcChannel.GetSettings),
  listSongs: () => ipcRenderer.invoke(IpcChannel.ListSongs),
  removeSong: (id) => ipcRenderer.invoke(IpcChannel.RemoveSong, id),
  resolveYouTubeMeta: (url) =>
    ipcRenderer.invoke(IpcChannel.ResolveYouTubeMeta, url),
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
