import { join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  shell,
} from "electron";
import appIcon from "../../resources/icon.png?asset";
import {
  APP_ASSET_HOST,
  APP_PROTOCOL,
  SONGS_PATH_SEGMENT,
} from "../shared/asset";
import { IpcChannel } from "../shared/ipc";
import {
  type AppInfo,
  type JobProgress,
  MODEL_QUALITIES,
  type ModelQuality,
  type ModelStatus,
  type Settings,
  type Song,
  type UpdateInfo,
} from "../shared/types";
import { isMigrating, setMigrating } from "./migration-state";
import {
  ensureModel,
  isModelReady,
  modelDownloadBytes,
} from "./provision/models";
import {
  enqueue,
  initQueue,
  recoverAndResume,
  retrySong,
  updateQueueConfig,
} from "./queue";
import { getSettings, setSettings } from "./settings";
import {
  addSong,
  listSongs as listSongsFromStore,
  removeSong as removeSongFromStore,
} from "./store/library";
import { migrateDataDir, validateDestination } from "./store/move-data";
import {
  downloadUpdate,
  fetchLatestUpdate,
  installAndRelaunch,
} from "./update/updater";
import { resolveYouTubeMeta, watchUrl } from "./youtube";

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let mainWindow: BrowserWindow | null = null;
let modelDownloadAbort: AbortController | null = null;
let updateDownloadAbort: AbortController | null = null;

function broadcast(
  channel: string,
  payload: Song | JobProgress | UpdateInfo
): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

/**
 * Fire-and-forget background update check. Only surfaces something to the
 * renderer when a newer release is actually found; failures (offline, rate
 * limited, etc.) are silently swallowed since this runs unprompted.
 */
function checkForUpdateInBackground(): void {
  fetchLatestUpdate()
    .then((info) => {
      if (info) {
        broadcast(IpcChannel.UpdateAvailable, info);
      }
    })
    .catch(() => {
      // Best-effort; the next periodic check (or a manual one) will retry.
    });
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

/**
 * `app://` must be registered as privileged before the app is ready so it can
 * be fetched from the renderer under the CSP and stream media/range requests.
 */
protocol.registerSchemesAsPrivileged([
  {
    privileges: {
      // corsEnabled is required so the renderer (served from the dev http
      // origin, or file:// in production) can fetch `app://` cross-origin;
      // without it the request is blocked before the handler even runs.
      corsEnabled: true,
      secure: true,
      standard: true,
      stream: true,
      supportFetchAPI: true,
    },
    scheme: APP_PROTOCOL,
  },
]);

const LEADING_SLASHES = /^\/+/;

/**
 * Serve a song's on-disk files (stems + peaks) to the renderer. Requests look
 * like `app://local/songs/<id>/drums.wav` and map to `<dataDir>/songs/…`. Paths
 * are constrained to the songs directory to prevent traversal, and missing
 * files return 404 so the renderer can fall back to fixtures.
 */
function registerAppProtocol(): void {
  protocol.handle(APP_PROTOCOL, async (request) => {
    const notFound = new Response("Not found", { status: 404 });
    try {
      const { host, pathname } = new URL(request.url);
      if (host !== APP_ASSET_HOST) {
        return notFound;
      }
      // Read the current data dir per request so stems still resolve after a
      // settings migration flips the pointer to a new location.
      const { dataDir } = await getSettings();
      const songsRoot = normalize(join(dataDir, SONGS_PATH_SEGMENT));
      const relative = decodeURIComponent(pathname).replace(
        LEADING_SLASHES,
        ""
      );
      const resolved = normalize(join(dataDir, relative));
      if (resolved !== songsRoot && !resolved.startsWith(songsRoot + sep)) {
        return new Response("Forbidden", { status: 403 });
      }
      const fileResponse = await net.fetch(pathToFileURL(resolved).toString());
      // Cross-origin fetch from the renderer needs an explicit CORS header.
      const headers = new Headers(fileResponse.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(fileResponse.body, {
        headers,
        status: fileResponse.status,
      });
    } catch {
      return notFound;
    }
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

  ipcMain.handle(IpcChannel.GetSettings, () => getSettings());

  ipcMain.handle(
    IpcChannel.SetSettings,
    async (_event, patch: Partial<Settings>) => {
      const next = await setSettings(patch);
      updateQueueConfig({
        dataDir: next.dataDir,
        modelQuality: next.modelQuality,
      });
      return next;
    }
  );

  ipcMain.handle(IpcChannel.IsMigrating, () => isMigrating());

  ipcMain.handle(
    IpcChannel.GetModelStatuses,
    async (): Promise<ModelStatus[]> => {
      const { dataDir } = await getSettings();
      return Promise.all(
        MODEL_QUALITIES.map(async (quality) => ({
          bytes: modelDownloadBytes(quality),
          quality,
          ready: await isModelReady(dataDir, quality),
        }))
      );
    }
  );

  ipcMain.handle(
    IpcChannel.DownloadModel,
    async (event, quality: ModelQuality) => {
      const { dataDir } = await getSettings();
      modelDownloadAbort = new AbortController();
      try {
        await ensureModel(
          dataDir,
          quality,
          (fraction) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send(IpcChannel.ModelDownloadProgress, {
                pct: fraction * 100,
                quality,
              });
            }
          },
          modelDownloadAbort.signal
        );
      } finally {
        modelDownloadAbort = null;
      }
      const next = await setSettings({ modelQuality: quality });
      updateQueueConfig({ modelQuality: next.modelQuality });
      return next;
    }
  );

  ipcMain.handle(IpcChannel.CancelModelDownload, () => {
    modelDownloadAbort?.abort();
  });

  ipcMain.handle(IpcChannel.ResolveYouTubeMeta, (_event, url: string) =>
    resolveYouTubeMeta(url)
  );

  ipcMain.handle(IpcChannel.AddSong, async (_event, ytUrl: string) => {
    if (isMigrating()) {
      throw new Error("Can't add songs while your library is being moved.");
    }
    const meta = await resolveYouTubeMeta(ytUrl);
    const { dataDir } = await getSettings();
    const song = await addSong(dataDir, {
      author: meta.author,
      thumbnailUrl: meta.thumbnailUrl,
      title: meta.title,
      ytUrl: watchUrl(meta.videoId),
    });
    enqueue();
    return song;
  });

  ipcMain.handle(IpcChannel.ListSongs, async () =>
    listSongsFromStore((await getSettings()).dataDir)
  );

  ipcMain.handle(IpcChannel.RemoveSong, async (_event, id: string) =>
    removeSongFromStore((await getSettings()).dataDir, id)
  );

  ipcMain.handle(IpcChannel.RetrySong, (_event, id: string) => retrySong(id));

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

  ipcMain.handle(IpcChannel.CheckForUpdate, () => fetchLatestUpdate());

  ipcMain.handle(IpcChannel.StartUpdate, async (event, info: UpdateInfo) => {
    updateDownloadAbort = new AbortController();
    let zipPath: string;
    try {
      zipPath = await downloadUpdate(
        info,
        (fraction) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(IpcChannel.UpdateDownloadProgress, {
              pct: fraction * 100,
            });
          }
        },
        updateDownloadAbort.signal
      );
    } finally {
      updateDownloadAbort = null;
    }
    // Quits the app as part of installing; nothing runs after this on success.
    installAndRelaunch(zipPath);
  });

  ipcMain.handle(IpcChannel.CancelUpdate, () => {
    updateDownloadAbort?.abort();
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
    const next = await getSettings();
    updateQueueConfig({ dataDir: next.dataDir });
    return next;
  });
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.socrash.app");

  // Show the Socrash mark in the dock (packaged builds use build/icon.icns;
  // this covers `pnpm dev` where the default Electron icon would show).
  if (process.platform === "darwin") {
    app.dock?.setIcon(appIcon);
  }

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  const settings = await getSettings();
  initQueue({
    broadcastProgress: (progress) =>
      broadcast(IpcChannel.JobProgress, progress),
    broadcastSong: (song) => broadcast(IpcChannel.SongUpdate, song),
    dataDir: settings.dataDir,
    modelQuality: settings.modelQuality,
  });

  registerAppProtocol();
  registerIpcHandlers();
  createWindow();

  // Recover any jobs interrupted by a crash/force-quit, then drain the backlog.
  resumeQueue();

  // Auto-update only makes sense for a packaged app living in a `.app`
  // bundle that can be swapped in place; dev builds skip it entirely.
  if (app.isPackaged) {
    checkForUpdateInBackground();
    setInterval(checkForUpdateInBackground, UPDATE_CHECK_INTERVAL_MS);
  }

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
