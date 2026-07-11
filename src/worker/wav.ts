/**
 * Minimal RIFF/WAVE codec for 32-bit IEEE-float PCM
 * (`WAVE_FORMAT_IEEE_FLOAT`). This is the only on-disk audio format Socrash
 * uses: the download worker writes `mix.wav` as 44.1 kHz stereo float32, and
 * the separation worker reads it back and writes `drums.wav` / `rest.wav` in
 * the same shape. Decode returns planar per-channel `Float32Array`s; encode
 * interleaves them back into a single WAV byte buffer.
 */

const RIFF_ID = 0x52_49_46_46; // "RIFF"
const WAVE_ID = 0x57_41_56_45; // "WAVE"
const FMT_ID = 0x66_6d_74_20; // "fmt "
const DATA_ID = 0x64_61_74_61; // "data"

const FORMAT_IEEE_FLOAT = 3;
const FORMAT_EXTENSIBLE = 0xff_fe;
const BITS_PER_SAMPLE = 32;
const BYTES_PER_SAMPLE = 4;

const CHUNK_HEADER_BYTES = 8;
const RIFF_HEADER_BYTES = 12;
const FMT_CHUNK_BYTES = 16;
const HEADER_BYTES = 44;

/** A decoded WAV file as planar channels plus its sample rate. */
export interface DecodedWav {
  channels: Float32Array[];
  sampleRate: number;
}

interface FmtChunk {
  bitsPerSample: number;
  format: number;
  numChannels: number;
  sampleRate: number;
}

function readFmt(view: DataView, body: number): FmtChunk {
  let format = view.getUint16(body, true);
  const numChannels = view.getUint16(body + 2, true);
  const sampleRate = view.getUint32(body + 4, true);
  const bitsPerSample = view.getUint16(body + 14, true);
  // WAVE_FORMAT_EXTENSIBLE stores the real format code in the first two bytes
  // of the SubFormat GUID, which starts 24 bytes into the chunk body.
  if (format === FORMAT_EXTENSIBLE) {
    format = view.getUint16(body + 24, true);
  }
  return { bitsPerSample, format, numChannels, sampleRate };
}

/**
 * Decode a 32-bit float WAV. Throws on any non-float / non-PCM layout so
 * corrupt or unexpected inputs surface as a readable pipeline error rather
 * than silently producing garbage audio.
 */
export function decodeWav(buffer: ArrayBuffer): DecodedWav {
  const view = new DataView(buffer);
  if (view.byteLength < RIFF_HEADER_BYTES) {
    throw new Error("Not a WAV file: truncated header.");
  }
  if (
    view.getUint32(0, false) !== RIFF_ID ||
    view.getUint32(8, false) !== WAVE_ID
  ) {
    throw new Error("Not a RIFF/WAVE file.");
  }

  let fmt: FmtChunk | null = null;
  let dataOffset = -1;
  let dataSize = 0;
  let offset = RIFF_HEADER_BYTES;
  while (offset + CHUNK_HEADER_BYTES <= view.byteLength) {
    const id = view.getUint32(offset, false);
    const size = view.getUint32(offset + 4, true);
    const body = offset + CHUNK_HEADER_BYTES;
    if (id === FMT_ID) {
      fmt = readFmt(view, body);
    } else if (id === DATA_ID) {
      dataOffset = body;
      dataSize = Math.min(size, view.byteLength - body);
    }
    // Chunks are word-aligned: an odd size is followed by a pad byte.
    offset = body + size + (size % 2);
  }

  if (fmt === null || dataOffset === -1) {
    throw new Error("WAV is missing a fmt or data chunk.");
  }
  const isFloat = fmt.format === FORMAT_IEEE_FLOAT;
  if (!(isFloat && fmt.bitsPerSample === BITS_PER_SAMPLE)) {
    throw new Error("WAV is not 32-bit IEEE float PCM.");
  }

  const { numChannels, sampleRate } = fmt;
  const frames = Math.floor(dataSize / (numChannels * BYTES_PER_SAMPLE));
  const channels = Array.from(
    { length: numChannels },
    () => new Float32Array(frames)
  );
  for (let frame = 0; frame < frames; frame += 1) {
    const frameOffset = dataOffset + frame * numChannels * BYTES_PER_SAMPLE;
    for (let ch = 0; ch < numChannels; ch += 1) {
      channels[ch][frame] = view.getFloat32(
        frameOffset + ch * BYTES_PER_SAMPLE,
        true
      );
    }
  }
  return { channels, sampleRate };
}

/**
 * Encode planar channels into a 32-bit float WAV byte buffer. All channels
 * must share the length of the first channel.
 */
export function encodeWav(
  channels: Float32Array[],
  sampleRate: number
): Uint8Array {
  const numChannels = channels.length;
  if (numChannels === 0) {
    throw new Error("Cannot encode a WAV with zero channels.");
  }
  const frames = channels[0].length;
  const blockAlign = numChannels * BYTES_PER_SAMPLE;
  const dataSize = frames * blockAlign;
  const bytes = new Uint8Array(HEADER_BYTES + dataSize);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, RIFF_ID, false);
  view.setUint32(4, HEADER_BYTES - CHUNK_HEADER_BYTES + dataSize, true);
  view.setUint32(8, WAVE_ID, false);
  view.setUint32(12, FMT_ID, false);
  view.setUint32(16, FMT_CHUNK_BYTES, true);
  view.setUint16(20, FORMAT_IEEE_FLOAT, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  view.setUint32(36, DATA_ID, false);
  view.setUint32(40, dataSize, true);

  let offset = HEADER_BYTES;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let ch = 0; ch < numChannels; ch += 1) {
      view.setFloat32(offset, channels[ch][frame], true);
      offset += BYTES_PER_SAMPLE;
    }
  }
  return bytes;
}
