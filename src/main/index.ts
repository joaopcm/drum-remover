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
import type { AppInfo } from "../shared/types";
import { getDefaultSettings } from "./settings";
import {
  addSong,
  listSongs as listSongsFromStore,
  removeSong as removeSongFromStore,
} from "./store/library";
import { resolveYouTubeMeta, watchUrl } from "./youtube";

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

  registerAppProtocol();
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
