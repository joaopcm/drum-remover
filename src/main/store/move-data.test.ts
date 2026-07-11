import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MigrationProgress } from "../../shared/types";
import { migrateDataDir, validateDestination } from "./move-data";

let root: string;

async function seed(dir: string): Promise<void> {
  await mkdir(join(dir, "songs", "abc"), { recursive: true });
  await mkdir(join(dir, "models"), { recursive: true });
  await writeFile(join(dir, "library.json"), '{"version":1,"songs":[]}');
  await writeFile(join(dir, "songs", "abc", "stem.wav"), "drum-audio-bytes");
  await writeFile(join(dir, "models", "htdemucs.onnx"), "model-weights");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "socrash-move-"));
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

describe("migrateDataDir", () => {
  it("copies the tree, verifies, flips the pointer, then removes the old dir", async () => {
    const from = join(root, "old");
    const to = join(root, "new");
    await seed(from);

    const flipPointer = vi.fn().mockResolvedValue(undefined);
    await migrateDataDir({ flipPointer, from, to });

    expect(flipPointer).toHaveBeenCalledOnce();
    expect(await exists(from)).toBe(false);
    expect(await readFile(join(to, "songs", "abc", "stem.wav"), "utf8")).toBe(
      "drum-audio-bytes"
    );
    expect(await readFile(join(to, "library.json"), "utf8")).toContain(
      "version"
    );
  });

  it("reports monotonic progress ending at the total byte count", async () => {
    const from = join(root, "old");
    const to = join(root, "new");
    await seed(from);

    const updates: MigrationProgress[] = [];
    await migrateDataDir({
      flipPointer: () => Promise.resolve(),
      from,
      onProgress: (p) => updates.push(p),
      to,
    });

    expect(updates.length).toBeGreaterThan(0);
    const total = updates.at(-1)?.totalBytes ?? 0;
    expect(total).toBeGreaterThan(0);
    expect(updates.at(-1)?.bytesCopied).toBe(total);
    for (let i = 1; i < updates.length; i += 1) {
      expect(updates[i].bytesCopied).toBeGreaterThanOrEqual(
        updates[i - 1].bytesCopied
      );
    }
  });

  it("leaves the old data and pointer intact when interrupted before the flip", async () => {
    const from = join(root, "old");
    const to = join(root, "new");
    await seed(from);

    const flipPointer = vi
      .fn()
      .mockRejectedValue(new Error("crash before flip"));

    await expect(migrateDataDir({ flipPointer, from, to })).rejects.toThrow(
      "crash"
    );

    // Old tree must survive fully — worst case is a duplicated copy.
    expect(await readFile(join(from, "songs", "abc", "stem.wav"), "utf8")).toBe(
      "drum-audio-bytes"
    );
    expect(await readFile(join(from, "models", "htdemucs.onnx"), "utf8")).toBe(
      "model-weights"
    );
    // The pointer was never flipped.
    expect(flipPointer).toHaveBeenCalledOnce();
  });

  it("handles a missing source directory as an empty move", async () => {
    const from = join(root, "does-not-exist");
    const to = join(root, "new");

    const flipPointer = vi.fn().mockResolvedValue(undefined);
    await migrateDataDir({ flipPointer, from, to });

    expect(flipPointer).toHaveBeenCalledOnce();
  });
});

describe("validateDestination", () => {
  it("rejects the current data directory", async () => {
    const current = join(root, "data");
    await mkdir(current, { recursive: true });
    const result = await validateDestination(current, current);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("already");
  });

  it("rejects a destination nested inside the current directory", async () => {
    const current = join(root, "data");
    await mkdir(current, { recursive: true });
    const nested = join(current, "songs", "deep");
    const result = await validateDestination(current, nested);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("outside");
  });

  it("accepts a fresh empty directory as non-nested and empty", async () => {
    const current = join(root, "data");
    const dest = join(root, "fresh");
    await mkdir(current, { recursive: true });
    const result = await validateDestination(current, dest);
    expect(result.ok).toBe(true);
    expect(result.nonEmpty).toBe(false);
  });

  it("flags a non-empty destination for confirmation", async () => {
    const current = join(root, "data");
    const dest = join(root, "has-files");
    await mkdir(current, { recursive: true });
    await mkdir(dest, { recursive: true });
    await writeFile(join(dest, "existing.txt"), "hi");
    const result = await validateDestination(current, dest);
    expect(result.ok).toBe(true);
    expect(result.nonEmpty).toBe(true);
  });
});
