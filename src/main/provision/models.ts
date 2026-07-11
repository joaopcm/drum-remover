import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ModelQuality } from "../../shared/types";

/**
 * Separation-model provisioning. Each {@link ModelQuality} maps to a set of
 * ONNX files downloaded on first use into `<dataDir>/models/<quality>/`, with
 * HTTP-range resume and SHA-256 verification. Only `'fast'` (the single-file
 * StemSplitio htdemucs fp16-weights export, ~166 MB) is wired up now; `#8`
 * fills in `'balanced'` (fp32) and `'best'` (the htdemucs_ft 4-model bag) by
 * adding entries to the registry — no changes needed elsewhere.
 */

interface ModelFile {
  filename: string;
  /** LFS SHA-256 (hex) of the file content, used for verification. */
  sha256: string;
  /** File size in bytes; a cheap reuse check that avoids re-hashing 166 MB. */
  size: number;
  url: string;
}

interface ModelSpec {
  files: ModelFile[];
}

const HF_FAST_BASE =
  "https://huggingface.co/StemSplitio/htdemucs-onnx/resolve/main";

const REGISTRY: Record<ModelQuality, ModelSpec> = {
  // Filled in by issue #8.
  balanced: { files: [] },
  best: { files: [] },
  // Single-file 4-stem htdemucs, fp16-stored weights (same runtime as fp32).
  fast: {
    files: [
      {
        filename: "htdemucs_fp16weights.onnx",
        sha256:
          "d05c269d0178d2a72ad484b10b11dd370193fc923201c3b27a99f848745db70a",
        size: 165_612_636,
        url: `${HF_FAST_BASE}/htdemucs_fp16weights.onnx`,
      },
    ],
  },
};

const HTTP_PARTIAL = 206;

/** Directory that holds a quality's model files. */
export function modelDir(dataDir: string, quality: ModelQuality): string {
  return join(dataDir, "models", quality);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/** A previously downloaded file is reusable when its size already matches. */
async function isComplete(dest: string, file: ModelFile): Promise<boolean> {
  if (!(await fileExists(dest))) {
    return false;
  }
  const { size } = await stat(dest);
  return size === file.size;
}

async function downloadFile(
  file: ModelFile,
  dest: string,
  onProgress?: (fraction: number) => void
): Promise<void> {
  const partial = `${dest}.download`;
  const existing = (await fileExists(partial)) ? (await stat(partial)).size : 0;
  const res = await fetch(
    file.url,
    existing > 0 ? { headers: { Range: `bytes=${existing}-` } } : {}
  );
  if (!(res.ok && res.body)) {
    throw new Error(`Failed to download model (HTTP ${res.status}).`);
  }

  const resuming = existing > 0 && res.status === HTTP_PARTIAL;
  let received = resuming ? existing : 0;
  const source = Readable.fromWeb(
    res.body as Parameters<typeof Readable.fromWeb>[0]
  );
  source.on("data", (chunk: Buffer) => {
    received += chunk.length;
    onProgress?.(Math.min(1, received / file.size));
  });
  await pipeline(
    source,
    createWriteStream(partial, { flags: resuming ? "a" : "w" })
  );

  const digest = await sha256File(partial);
  if (digest !== file.sha256) {
    await rm(partial, { force: true });
    throw new Error("Downloaded model failed checksum verification.");
  }
  await rename(partial, dest);
}

/**
 * Ensure every file for `quality` is present and verified, downloading (with
 * resume) whatever is missing. `onProgress` receives an aggregate 0..1
 * fraction across all files. Returns the path to the primary `.onnx` model.
 */
export async function ensureModel(
  dataDir: string,
  quality: ModelQuality,
  onProgress?: (fraction: number) => void
): Promise<string> {
  const spec = REGISTRY[quality];
  if (spec.files.length === 0) {
    throw new Error(`The "${quality}" model is not available yet.`);
  }

  const dir = modelDir(dataDir, quality);
  await mkdir(dir, { recursive: true });

  const totalBytes = spec.files.reduce((sum, file) => sum + file.size, 0);
  let completedBytes = 0;
  for (const file of spec.files) {
    const dest = join(dir, file.filename);
    // biome-ignore lint/performance/noAwaitInLoops: files download sequentially
    if (await isComplete(dest, file)) {
      completedBytes += file.size;
      onProgress?.(completedBytes / totalBytes);
      continue;
    }
    await downloadFile(file, dest, (fraction) => {
      onProgress?.((completedBytes + fraction * file.size) / totalBytes);
    });
    completedBytes += file.size;
  }

  return join(dir, spec.files[0].filename);
}
