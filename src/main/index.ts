import { join } from "node:path";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { IpcChannel } from "../shared/ipc";
import type { AppInfo, Settings } from "../shared/types";
import { isMigrating, setMigrating } from "./migration-state";
import { getSettings, setSettings } from "./settings";
import {
  addSong,
  listSongs as listSongsFromStore,
  removeSong as removeSongFromStore,
} from "./store/library";
import { migrateDataDir, validateDestination } from "./store/move-data";
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

  ipcMain.handle(IpcChannel.GetSettings, () => getSettings());

  ipcMain.handle(IpcChannel.SetSettings, (_event, patch: Partial<Settings>) =>
    setSettings(patch)
  );

  ipcMain.handle(IpcChannel.IsMigrating, () => isMigrating());

  ipcMain.handle(IpcChannel.ResolveYouTubeMeta, (_event, url: string) =>
    resolveYouTubeMeta(url)
  );

  ipcMain.handle(IpcChannel.AddSong, async (_event, ytUrl: string) => {
    if (isMigrating()) {
      throw new Error("Can't add songs while your library is being moved.");
    }
    const meta = await resolveYouTubeMeta(ytUrl);
    const { dataDir } = await getSettings();
    return addSong(dataDir, {
      author: meta.author,
      thumbnailUrl: meta.thumbnailUrl,
      title: meta.title,
      ytUrl: watchUrl(meta.videoId),
    });
  });

  ipcMain.handle(IpcChannel.ListSongs, async () =>
    listSongsFromStore((await getSettings()).dataDir)
  );

  ipcMain.handle(IpcChannel.RemoveSong, async (_event, id: string) =>
    removeSongFromStore((await getSettings()).dataDir, id)
  );

  ipcMain.handle(IpcChannel.ChooseDataDir, async () => {
    const result = await dialog.showOpenDialog({
      buttonLabel: "Use this folder",
      properties: ["openDirectory", "createDirectory"],
      title: "Choose a data folder",
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle(IpcChannel.ValidateDataDir, async (_event, dest: string) => {
    const { dataDir } = await getSettings();
    return validateDestination(dataDir, dest);
  });

  ipcMain.handle(IpcChannel.MoveDataDir, async (event, dest: string) => {
    if (isMigrating()) {
      throw new Error("A move is already in progress.");
    }
    const { dataDir } = await getSettings();
    const check = await validateDestination(dataDir, dest);
    if (!check.ok) {
      throw new Error(check.message ?? "That folder can't be used.");
    }

    setMigrating(true);
    try {
      await migrateDataDir({
        flipPointer: async () => {
          await setSettings({ dataDir: dest });
        },
        from: dataDir,
        onProgress: (progress) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(IpcChannel.MigrationProgress, progress);
          }
        },
        to: dest,
      });
    } finally {
      setMigrating(false);
    }
    return getSettings();
  });
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
