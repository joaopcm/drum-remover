import { join } from "node:path";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { IpcChannel } from "../shared/ipc";
import type { AppInfo, JobProgress, Song } from "../shared/types";
import { enqueue, initQueue, recoverAndResume, retrySong } from "./queue";
import { getDefaultSettings } from "./settings";
import {
  addSong,
  listSongs as listSongsFromStore,
  removeSong as removeSongFromStore,
} from "./store/library";
import { resolveYouTubeMeta, watchUrl } from "./youtube";

let mainWindow: BrowserWindow | null = null;

function broadcast(channel: string, payload: Song | JobProgress): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

/**
 * Fire-and-forget launch recovery. A failed recovery pass leaves songs as-is;
 * the next add still pumps the queue.
 */
function resumeQueue(): void {
  recoverAndResume().catch(() => {
    // Intentionally ignored; recovery is best-effort at launch.
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
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
  mainWindow = win;

  win.on("ready-to-show", () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
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
    const song = await addSong(dataDir, {
      author: meta.author,
      thumbnailUrl: meta.thumbnailUrl,
      title: meta.title,
      ytUrl: watchUrl(meta.videoId),
    });
    enqueue();
    return song;
  });

  ipcMain.handle(IpcChannel.ListSongs, () =>
    listSongsFromStore(getDefaultSettings().dataDir)
  );

  ipcMain.handle(IpcChannel.RemoveSong, (_event, id: string) =>
    removeSongFromStore(getDefaultSettings().dataDir, id)
  );

  ipcMain.handle(IpcChannel.RetrySong, (_event, id: string) => retrySong(id));
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.socrash.app");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  initQueue({
    broadcastProgress: (progress) =>
      broadcast(IpcChannel.JobProgress, progress),
    broadcastSong: (song) => broadcast(IpcChannel.SongUpdate, song),
    dataDir: getDefaultSettings().dataDir,
  });

  registerIpcHandlers();
  createWindow();

  // Recover any jobs interrupted by a crash/force-quit, then drain the backlog.
  resumeQueue();

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
