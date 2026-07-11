/**
 * Waveform peak extraction for the player. `computePeaks` reduces a mono
 * channel to a fixed number of buckets, each holding the peak (max absolute)
 * magnitude over its slice, then normalizes every bucket to 0..1 by the
 * loudest bucket. The result matches the `PeaksData` contract shared with the
 * renderer (issue #5).
 */

/** Number of buckets written per stem in `peaks.json`. */
export const PEAK_BUCKETS = 2000;

/**
 * Reduce a channel to `buckets` normalized peak magnitudes (0..1). A constant
 * channel yields a constant array of 1s; pure silence yields all zeros; the
 * returned length always equals `buckets`.
 */
export function computePeaks(channel: Float32Array, buckets: number): number[] {
  if (buckets <= 0) {
    return [];
  }
  const peaks = new Array<number>(buckets).fill(0);
  const { length } = channel;
  if (length === 0) {
    return peaks;
  }

  const perBucket = Math.ceil(length / buckets);
  let loudest = 0;
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const start = bucket * perBucket;
    const end = Math.min(start + perBucket, length);
    let peak = 0;
    for (let i = start; i < end; i += 1) {
      const magnitude = Math.abs(channel[i]);
      if (magnitude > peak) {
        peak = magnitude;
      }
    }
    peaks[bucket] = peak;
    if (peak > loudest) {
      loudest = peak;
    }
  }

  if (loudest > 0) {
    for (let bucket = 0; bucket < buckets; bucket += 1) {
      peaks[bucket] /= loudest;
    }
  }
  return peaks;
}

/** Samples-per-bucket used for `buckets` over a channel of `length` samples. */
export function samplesPerBucket(length: number, buckets: number): number {
  if (buckets <= 0 || length === 0) {
    return 0;
  }
  return Math.ceil(length / buckets);
}

/**
 * Collapse planar stereo (or mono) channels to a single mono channel by
 * averaging, so peaks reflect the whole stem rather than one side.
 */
export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) {
    return channels[0];
  }
  const [first] = channels;
  const mono = new Float32Array(first.length);
  for (let i = 0; i < mono.length; i += 1) {
    let sum = 0;
    for (const channel of channels) {
      sum += channel[i];
    }
    mono[i] = sum / channels.length;
  }
  return mono;
}
