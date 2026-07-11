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

const HF_SINGLE_BASE =
  "https://huggingface.co/StemSplitio/htdemucs-onnx/resolve/main";
const HF_FT_BASE =
  "https://huggingface.co/StemSplitio/htdemucs-ft-onnx/resolve/main";

/**
 * `best` is the htdemucs_ft "bag of models" — four specialists, one per source.
 * The files are listed in {@link SOURCES} order (drums, bass, other, vocals) so
 * the separator can take each specialist's own target stem.
 */
const REGISTRY: Record<ModelQuality, ModelSpec> = {
  // Single-file 4-stem htdemucs, full fp32 weights (~316 MB).
  balanced: {
    files: [
      {
        filename: "htdemucs.onnx",
        sha256:
          "68d0bf16428ef66e692cdff8a9ccf28f1ef3f69440d57e58605a4cc55fcc5e74",
        size: 316_446_953,
        url: `${HF_SINGLE_BASE}/htdemucs.onnx`,
      },
    ],
  },
  best: {
    files: [
      {
        filename: "htdemucs_ft_drums.onnx",
        sha256:
          "f76b68af36066e38885b369299b5032a861038f9b49da5aa6cf1c31cfa69cf27",
        size: 316_446_953,
        url: `${HF_FT_BASE}/htdemucs_ft_drums.onnx`,
      },
      {
        filename: "htdemucs_ft_bass.onnx",
        sha256:
          "2a74d9283fc2336fcc58d50f87a7080aff57aea372f65cfe3f0211ea1ff16182",
        size: 316_446_953,
        url: `${HF_FT_BASE}/htdemucs_ft_bass.onnx`,
      },
      {
        filename: "htdemucs_ft_other.onnx",
        sha256:
          "90e11806c1bb558ca9d9c7e909d28a2854f7f217982e90482dbed6442513daad",
        size: 316_446_953,
        url: `${HF_FT_BASE}/htdemucs_ft_other.onnx`,
      },
      {
        filename: "htdemucs_ft_vocals.onnx",
        sha256:
          "8c5d5e2da1f27050240bb80236673307ee3b40d4b064066d9350f4d64bfd544d",
        size: 316_446_953,
        url: `${HF_FT_BASE}/htdemucs_ft_vocals.onnx`,
      },
    ],
  },
  // Single-file 4-stem htdemucs, fp16-stored weights (same runtime as fp32).
  fast: {
    files: [
      {
        filename: "htdemucs_fp16weights.onnx",
        sha256:
          "d05c269d0178d2a72ad484b10b11dd370193fc923201c3b27a99f848745db70a",
        size: 165_612_636,
        url: `${HF_SINGLE_BASE}/htdemucs_fp16weights.onnx`,
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
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const partial = `${dest}.download`;
  const existing = (await fileExists(partial)) ? (await stat(partial)).size : 0;
  const res = await fetch(file.url, {
    ...(existing > 0 ? { headers: { Range: `bytes=${existing}-` } } : {}),
    signal,
  });
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

/** Total download size (bytes) for a quality — surfaced in the settings UI. */
export function modelDownloadBytes(quality: ModelQuality): number {
  return REGISTRY[quality].files.reduce((sum, file) => sum + file.size, 0);
}

/**
 * Ensure every file for `quality` is present and verified, downloading (with
 * resume) whatever is missing. `onProgress` receives an aggregate 0..1
 * fraction across all files. Returns the paths to every `.onnx` file in
 * registry order — one for single-model qualities, four for the `best` bag.
 */
export async function ensureModel(
  dataDir: string,
  quality: ModelQuality,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal
): Promise<string[]> {
  const spec = REGISTRY[quality];
  if (spec.files.length === 0) {
    throw new Error(`The "${quality}" model is not available yet.`);
  }

  const dir = modelDir(dataDir, quality);
  await mkdir(dir, { recursive: true });

  const totalBytes = spec.files.reduce((sum, file) => sum + file.size, 0);
  let completedBytes = 0;
  const paths: string[] = [];
  for (const file of spec.files) {
    const dest = join(dir, file.filename);
    paths.push(dest);
    // biome-ignore lint/performance/noAwaitInLoops: files download sequentially
    if (await isComplete(dest, file)) {
      completedBytes += file.size;
      onProgress?.(completedBytes / totalBytes);
      continue;
    }
    await downloadFile(
      file,
      dest,
      (fraction) => {
        onProgress?.((completedBytes + fraction * file.size) / totalBytes);
      },
      signal
    );
    completedBytes += file.size;
  }

  return paths;
}

/** Whether every file for `quality` is already downloaded and complete. */
export async function isModelReady(
  dataDir: string,
  quality: ModelQuality
): Promise<boolean> {
  const spec = REGISTRY[quality];
  if (spec.files.length === 0) {
    return false;
  }
  const dir = modelDir(dataDir, quality);
  for (const file of spec.files) {
    // biome-ignore lint/performance/noAwaitInLoops: cheap sequential stat checks
    if (!(await isComplete(join(dir, file.filename), file))) {
      return false;
    }
  }
  return true;
}
