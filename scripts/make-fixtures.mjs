// @ts-nocheck
/**
 * Synthesize tiny stereo WAV stems (+ a matching peaks.json) used as the
 * player's fixtures until the real separation pipeline (issue #4) lands.
 *
 *   node scripts/make-fixtures.mjs
 *
 * Output: src/renderer/src/player/fixtures/{drums.wav,rest.wav,peaks.json}
 *   - drums.wav: a decaying click/pulse train (a stand-in "beat")
 *   - rest.wav:  a sustained sine chord (a stand-in "everything else")
 * Deterministic (seeded noise) so re-running produces identical, committable
 * files.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 22_050;
const DURATION_SEC = 3;
const FRAMES = SAMPLE_RATE * DURATION_SEC;
const BUCKETS = 2000;
const TWO_PI = Math.PI * 2;

/** Deterministic pseudo-noise in [-1, 1] from an index (no bitwise ops). */
function noiseAt(index) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43_758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function synthDrums() {
  const data = new Float32Array(FRAMES);
  const beatSec = 0.5; // 120 BPM
  for (let i = 0; i < FRAMES; i += 1) {
    const t = i / SAMPLE_RATE;
    const intoBeat = t % beatSec;
    const envelope = Math.exp(-intoBeat * 45);
    const noise = noiseAt(i);
    const tone = Math.sin(TWO_PI * 180 * t);
    data[i] = envelope * (noise * 0.6 + tone * 0.4) * 0.9;
  }
  return data;
}

function synthRest() {
  const data = new Float32Array(FRAMES);
  const chord = [220, 277.18, 329.63]; // A major triad
  const fadeSec = 0.15;
  for (let i = 0; i < FRAMES; i += 1) {
    const t = i / SAMPLE_RATE;
    let sample = 0;
    for (const freq of chord) {
      sample += Math.sin(TWO_PI * freq * t);
    }
    sample /= chord.length;
    const fadeIn = Math.min(1, t / fadeSec);
    const fadeOut = Math.min(1, (DURATION_SEC - t) / fadeSec);
    data[i] = sample * 0.6 * fadeIn * fadeOut;
  }
  return data;
}

/** Encode one mono Float32 signal as a 16-bit PCM stereo WAV (dual mono). */
function encodeStereoWav(mono) {
  const numChannels = 2;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = mono.length * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (const sample of mono) {
    const clamped = Math.max(-1, Math.min(1, sample));
    const value = Math.round(
      clamped < 0 ? clamped * 0x80_00 : clamped * 0x7f_ff
    );
    buffer.writeInt16LE(value, offset);
    buffer.writeInt16LE(value, offset + 2);
    offset += 4;
  }
  return buffer;
}

/** Mirror of src/renderer/src/player/peaks.ts so fixtures match the runtime. */
function computePeaks(channelData, buckets) {
  if (buckets <= 0) {
    return [];
  }
  const peaks = new Array(buckets).fill(0);
  const sampleCount = channelData.length;
  if (sampleCount === 0) {
    return peaks;
  }
  const bucketSize = sampleCount / buckets;
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const start = Math.floor(bucket * bucketSize);
    const end =
      bucket === buckets - 1
        ? sampleCount
        : Math.floor((bucket + 1) * bucketSize);
    let peak = 0;
    for (let i = start; i < end; i += 1) {
      const magnitude = Math.abs(channelData[i]);
      if (magnitude > peak) {
        peak = magnitude;
      }
    }
    peaks[bucket] = Math.round(Math.min(1, peak) * 1000) / 1000;
  }
  return peaks;
}

async function main() {
  const outDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "src/renderer/src/player/fixtures"
  );
  await mkdir(outDir, { recursive: true });

  const drums = synthDrums();
  const rest = synthRest();

  await writeFile(join(outDir, "drums.wav"), encodeStereoWav(drums));
  await writeFile(join(outDir, "rest.wav"), encodeStereoWav(rest));

  const peaks = {
    drums: computePeaks(drums, BUCKETS),
    rest: computePeaks(rest, BUCKETS),
    sampleRate: SAMPLE_RATE,
    samplesPerBucket: Math.ceil(FRAMES / BUCKETS),
    version: 1,
  };
  await writeFile(join(outDir, "peaks.json"), JSON.stringify(peaks));

  process.stdout.write(`Wrote fixtures to ${outDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error}\n`);
  process.exit(1);
});
