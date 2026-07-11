/**
 * Reduce a decoded audio channel to a fixed number of normalized peak
 * magnitudes, one per bucket. This is the data the waveform draws from, and the
 * shape issue #4 will persist as `peaks.json` (see `PeaksData` in shared types).
 *
 * Pure and dependency-free so it can run both in the renderer (fixtures) and in
 * the separation pipeline (#4).
 */

/**
 * Compute `buckets` peak magnitudes from `channelData`. Each value is the
 * maximum absolute sample in that bucket, already in 0..1 for full-scale audio
 * and clamped there defensively. The returned array always has `buckets`
 * entries: buckets with no samples (silence, or when `buckets` exceeds the
 * sample count) are `0`.
 */
export function computePeaks(
  channelData: Float32Array,
  buckets: number
): number[] {
  if (buckets <= 0) {
    return [];
  }

  const peaks = new Array<number>(buckets).fill(0);
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
    peaks[bucket] = peak > 1 ? 1 : peak;
  }

  return peaks;
}
