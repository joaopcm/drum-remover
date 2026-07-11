import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import type { Settings } from "../shared/types";

/**
 * Default settings used on first run and as a fallback when the settings file
 * is missing or unreadable. The data directory holds the library index, song
 * stems, and downloaded models; it defaults to a `data` folder inside
 * Electron's userData path.
 */
export function getDefaultSettings(): Settings {
  return {
    dataDir: join(app.getPath("userData"), "data"),
    modelQuality: "fast",
  };
}

/**
 * Absolute path of the settings file. It lives directly in userData — NOT in
 * `dataDir` — so the pointer to the data directory survives a move.
 */
function settingsPath(): string {
  return join(app.getPath("userData"), "settings.json");
}

/**
 * Read the persisted settings, merged over defaults so new fields always have
 * a value. On first run (no file) the defaults are written out and returned.
 * A corrupt/unreadable file falls back to defaults without clobbering it.
 */
export async function getSettings(): Promise<Settings> {
  const defaults = getDefaultSettings();
  try {
    const raw = await readFile(settingsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...defaults, ...parsed };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      await writeSettings(defaults);
      return defaults;
    }
    return defaults;
  }
}

/** Atomically persist settings via a temp file + rename. */
async function writeSettings(settings: Settings): Promise<void> {
  const target = settingsPath();
  const tmp = `${target}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(settings, null, 2), "utf8");
  await rename(tmp, target);
}

/** Merge a partial patch into the current settings and persist the result. */
export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = { ...current, ...patch };
  await writeSettings(next);
  return next;
}
