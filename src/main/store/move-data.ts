import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { DataDirValidation, MigrationProgress } from "../../shared/types";

interface WalkedFile {
  abs: string;
  rel: string;
  size: number;
}

interface WalkResult {
  files: WalkedFile[];
  totalBytes: number;
}

/** List a directory's entries, treating a missing directory as empty. */
async function readEntries(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

/**
 * Recursively list every regular file under `root` with its size. A missing
 * root yields an empty result — a fresh install has no data to move yet.
 */
async function walk(root: string): Promise<WalkResult> {
  const files: WalkedFile[] = [];

  async function visit(dir: string): Promise<void> {
    const entries = await readEntries(dir);
    await Promise.all(
      entries.map(async (entry) => {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) {
          await visit(abs);
        } else if (entry.isFile()) {
          const info = await stat(abs);
          files.push({ abs, rel: relative(root, abs), size: info.size });
        }
      })
    );
  }

  await visit(root);
  // Sort for deterministic copy order so progress is stable and reproducible.
  files.sort((a, b) => a.rel.localeCompare(b.rel));
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return { files, totalBytes };
}

/** Copy one file, creating its parent directory first. */
async function copyInto(file: WalkedFile, dest: string): Promise<void> {
  const target = join(dest, file.rel);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(file.abs, target);
}

/** True when `dest` is the same as, or nested inside, `current`. */
function isInside(current: string, dest: string): boolean {
  const rel = relative(current, dest);
  return rel === "" || !(rel.startsWith("..") || isAbsolute(rel));
}

/**
 * Check a candidate data directory before a move. Rejects the current folder,
 * anything nested inside it, and unwritable locations; flags non-empty targets
 * so the caller can ask for confirmation.
 */
export async function validateDestination(
  current: string,
  dest: string
): Promise<DataDirValidation> {
  const resolvedCurrent = resolve(current);
  const resolvedDest = resolve(dest);

  if (resolvedDest === resolvedCurrent) {
    return {
      message: "That's already your data folder.",
      nonEmpty: false,
      ok: false,
    };
  }

  if (isInside(resolvedCurrent, resolvedDest)) {
    return {
      message: "Choose a folder outside your current data folder.",
      nonEmpty: false,
      ok: false,
    };
  }

  const probe = join(resolvedDest, `.socrash-write-test-${randomUUID()}`);
  try {
    await mkdir(resolvedDest, { recursive: true });
    await writeFile(probe, "ok", "utf8");
    await rm(probe, { force: true });
  } catch {
    return {
      message: "That folder can't be written to. Pick another one.",
      nonEmpty: false,
      ok: false,
    };
  }

  const entries = await readdir(resolvedDest);
  return { message: null, nonEmpty: entries.length > 0, ok: true };
}

interface MigrateOptions {
  /** Persist the new pointer. Called only AFTER copy + verify succeed. */
  flipPointer: () => Promise<void>;
  from: string;
  onProgress?: (progress: MigrationProgress) => void;
  to: string;
}

/**
 * Safely move a data tree. Order guarantees no loss: copy everything → verify
 * (file count + total bytes) → flip the settings pointer → delete the old tree.
 * Any failure before `flipPointer` resolves leaves the old tree fully intact
 * (worst case: a partial copy at the destination, which is discardable).
 */
export async function migrateDataDir(options: MigrateOptions): Promise<void> {
  const { from, to, flipPointer, onProgress } = options;
  const source = resolve(from);
  const dest = resolve(to);

  const { files, totalBytes } = await walk(source);
  onProgress?.({ bytesCopied: 0, totalBytes });

  let bytesCopied = 0;
  for (const file of files) {
    // Copies run one at a time on purpose: it keeps progress monotonic and
    // avoids flooding the disk with thousands of concurrent handles.
    // biome-ignore lint/performance/noAwaitInLoops: sequential copy is intentional
    await copyInto(file, dest);
    bytesCopied += file.size;
    onProgress?.({ bytesCopied, totalBytes });
  }

  await verifyCopy(files, totalBytes, dest);
  await flipPointer();
  await rm(source, { force: true, recursive: true });
}

/** Confirm every source file landed at the destination with a matching size. */
async function verifyCopy(
  files: WalkedFile[],
  totalBytes: number,
  dest: string
): Promise<void> {
  const sizes = await Promise.all(
    files.map(async (file) => {
      const info = await stat(join(dest, file.rel));
      if (info.size !== file.size) {
        throw new Error(
          `Copy mismatch for ${file.rel}; aborting before delete.`
        );
      }
      return info.size;
    })
  );
  const copiedBytes = sizes.reduce((sum, size) => sum + size, 0);
  if (copiedBytes !== totalBytes) {
    throw new Error("Copied byte total did not match source; aborting.");
  }
}
