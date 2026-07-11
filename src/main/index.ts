import { join } from "node:path";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { IpcChannel } from "../shared/ipc";
import type { AppInfo } from "../shared/types";
import { getDefaultSettings } from "./settings";
import {
  addSong,
  listSongs as listSongsFromStore,
  removeSong as removeSongFromStore,
} from "./store/library";
import { resolveYouTubeMeta, watchUrl } from "./youtube";

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: "#0c0e12",
    height: 800,
    minHeight: 640,
    minWidth: 900,
    show: false,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.js"),
      sandbox: false,
    },
    width: 1180,
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(
    IpcChannel.GetAppInfo,
    (): AppInfo => ({
      chrome: process.versions.chrome,
      electron: process.versions.electron,
      name: "Socrash",
      node: process.versions.node,
      platform: process.platform,
      version: app.getVersion(),
    })
  );

  ipcMain.handle(IpcChannel.GetSettings, () => getDefaultSettings());

  ipcMain.handle(IpcChannel.ResolveYouTubeMeta, (_event, url: string) =>
    resolveYouTubeMeta(url)
  );

  ipcMain.handle(IpcChannel.AddSong, async (_event, ytUrl: string) => {
    const meta = await resolveYouTubeMeta(ytUrl);
    const { dataDir } = getDefaultSettings();
    return addSong(dataDir, {
      author: meta.author,
      thumbnailUrl: meta.thumbnailUrl,
      title: meta.title,
      ytUrl: watchUrl(meta.videoId),
    });
  });

  ipcMain.handle(IpcChannel.ListSongs, () =>
    listSongsFromStore(getDefaultSettings().dataDir)
  );

  ipcMain.handle(IpcChannel.RemoveSong, (_event, id: string) =>
    removeSongFromStore(getDefaultSettings().dataDir, id)
  );
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.socrash.app");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
