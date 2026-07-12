import { spawn } from "node:child_process";
import { createWriteStream, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { app } from "electron";
import type { UpdateInfo } from "../../shared/types";
import { BUILD_TAG } from "../build-info";
import { buildInstallScript, resolveAppBundlePath } from "./install-script";
import {
  compareBuildTags,
  type GitHubReleaseAsset,
  pickMacZipAsset,
} from "./release";

/**
 * Custom GitHub-Releases updater. Socrash ships ad-hoc signed, unnotarized
 * builds distributed only via GitHub Releases, so the usual Squirrel.Mac /
 * `electron-updater` path (which expects a signed app + a `latest-mac.yml`
 * feed) doesn't apply. Instead this polls the GitHub API directly, compares
 * the release tag against {@link BUILD_TAG}, and — if newer — downloads the
 * release's mac `.zip` asset and swaps it into place via a detached shell
 * helper once the app quits.
 */

const GITHUB_OWNER = "joaopcm";
// See package.json "homepage"; kept as a constant rather than parsed at
// runtime since it never changes independently of a code change.
const GITHUB_REPO = "socrash";
const GITHUB_LATEST_RELEASE_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

interface GitHubRelease {
  assets: GitHubReleaseAsset[];
  body: string | null;
  tag_name: string;
}

/**
 * Checks GitHub for a release newer than the running build. Resolves `null`
 * on any failure (network error, non-200, no build tag, no mac zip asset) —
 * update checks are best-effort and must never surface as app errors.
 */
export async function fetchLatestUpdate(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(GITHUB_LATEST_RELEASE_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Socrash",
      },
    });
    if (!res.ok) {
      return null;
    }
    const release = (await res.json()) as GitHubRelease;
    if (compareBuildTags(BUILD_TAG, release.tag_name) >= 0) {
      return null;
    }
    const asset = pickMacZipAsset(release.assets);
    if (!asset) {
      return null;
    }
    return {
      notes: release.body,
      tag: release.tag_name,
      zipSize: asset.size,
      zipUrl: asset.browser_download_url,
    };
  } catch {
    return null;
  }
}

/**
 * Streams the release's mac `.zip` to a temp file, reporting 0..1 progress.
 * Returns the downloaded zip's path. Mirrors the resumable-download shape in
 * `src/main/provision/models.ts`, minus resume — a cancelled/failed update
 * download is cheap to restart from scratch on the next check.
 */
export async function downloadUpdate(
  info: UpdateInfo,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal
): Promise<string> {
  const dir = join(app.getPath("temp"), "socrash-update");
  await mkdir(dir, { recursive: true });
  const dest = join(dir, `${info.tag}.zip`);

  const res = await fetch(info.zipUrl, { signal });
  if (!(res.ok && res.body)) {
    throw new Error(`Failed to download update (HTTP ${res.status}).`);
  }

  let received = 0;
  const source = Readable.fromWeb(
    res.body as Parameters<typeof Readable.fromWeb>[0]
  );
  source.on("data", (chunk: Buffer) => {
    received += chunk.length;
    onProgress?.(Math.min(1, received / info.zipSize));
  });
  await pipeline(source, createWriteStream(dest));

  return dest;
}

/**
 * Spawns the detached install script and quits so it can safely replace the
 * running app's bundle, then quits Socrash. No-ops outside a packaged app
 * (dev builds don't live inside a `.app` bundle to swap).
 */
export function installAndRelaunch(zipPath: string): void {
  if (!app.isPackaged) {
    return;
  }
  const appPath = resolveAppBundlePath(app.getPath("exe"));
  if (!appPath) {
    return;
  }
  const scriptPath = `${zipPath}.install.sh`;
  writeFileSync(scriptPath, buildInstallScript(process.pid, zipPath, appPath), {
    mode: 0o755,
  });
  spawn("/bin/bash", [scriptPath], { detached: true, stdio: "ignore" }).unref();
  app.quit();
}
