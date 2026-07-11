import { createWriteStream } from "node:fs";
import { access, chmod, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * yt-dlp provisioning. On the first job we download the standalone
 * `yt-dlp_macos` binary from the official GitHub releases into
 * `<dataDir>/bin/`, mark it executable, and reuse it on every subsequent run.
 */

const YTDLP_RELEASE_URL =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos";

/** Absolute path to the provisioned yt-dlp binary for a data directory. */
export function ytdlpPath(dataDir: string): string {
  return join(dataDir, "bin", "yt-dlp_macos");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the yt-dlp binary exists locally and return its path. Downloads it on
 * first use; a no-op (cheap `access` check) afterwards. `onProgress` receives a
 * 0–100 percentage while downloading (best-effort; only when the server sends a
 * `content-length`).
 */
export async function ensureYtdlp(
  dataDir: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  const dest = ytdlpPath(dataDir);
  if (await fileExists(dest)) {
    return dest;
  }

  await mkdir(join(dataDir, "bin"), { recursive: true });

  const res = await fetch(YTDLP_RELEASE_URL);
  if (!(res.ok && res.body)) {
    throw new Error(`Failed to download yt-dlp (HTTP ${res.status}).`);
  }

  const total = Number(res.headers.get("content-length")) || 0;
  let received = 0;
  const source = Readable.fromWeb(
    res.body as Parameters<typeof Readable.fromWeb>[0]
  );
  if (onProgress && total > 0) {
    source.on("data", (chunk: Buffer) => {
      received += chunk.length;
      onProgress(Math.min(100, Math.round((received / total) * 100)));
    });
  }

  const tmp = `${dest}.download`;
  await pipeline(source, createWriteStream(tmp));
  await chmod(tmp, 0o755);
  await rename(tmp, dest);
  return dest;
}
