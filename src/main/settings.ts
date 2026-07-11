import { join } from "node:path";
import { app } from "electron";
import type { Settings } from "../shared/types";

/**
 * Default settings used until the persistent settings store lands (issue #7).
 * The data directory holds the library index, song stems, and downloaded
 * models; it defaults to a `data` folder inside Electron's userData path.
 */
export function getDefaultSettings(): Settings {
  return {
    dataDir: join(app.getPath("userData"), "data"),
    modelQuality: "fast",
  };
}
