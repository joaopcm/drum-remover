import { join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import { app, BrowserWindow, ipcMain, net, protocol, shell } from "electron";
import {
  APP_ASSET_HOST,
  APP_PROTOCOL,
  SONGS_PATH_SEGMENT,
} from "../shared/asset";
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

/**
 * `app://` must be registered as privileged before the app is ready so it can
 * be fetched from the renderer under the CSP and stream media/range requests.
 */
protocol.registerSchemesAsPrivileged([
  {
    privileges: {
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
  const { dataDir } = getDefaultSettings();
  const songsRoot = normalize(join(dataDir, SONGS_PATH_SEGMENT));

  protocol.handle(APP_PROTOCOL, async (request) => {
    const notFound = new Response("Not found", { status: 404 });
    try {
      const { host, pathname } = new URL(request.url);
      if (host !== APP_ASSET_HOST) {
        return notFound;
      }
      const relative = decodeURIComponent(pathname).replace(
        LEADING_SLASHES,
        ""
      );
      const resolved = normalize(join(dataDir, relative));
      if (resolved !== songsRoot && !resolved.startsWith(songsRoot + sep)) {
        return new Response("Forbidden", { status: 403 });
      }
      return await net.fetch(pathToFileURL(resolved).toString());
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

  const settings = getDefaultSettings();
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
