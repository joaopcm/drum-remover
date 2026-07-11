import { describe, expect, it } from "vitest";
import { computePeaks } from "./peaks";

describe("computePeaks", () => {
  it("returns exactly `buckets` entries", () => {
    const data = new Float32Array(1000);
    expect(computePeaks(data, 200)).toHaveLength(200);
    expect(computePeaks(data, 1)).toHaveLength(1);
  });

  it("maps a constant signal to constant peaks", () => {
    const data = new Float32Array(1000).fill(0.5);
    const peaks = computePeaks(data, 50);
    expect(peaks).toHaveLength(50);
    for (const peak of peaks) {
      expect(peak).toBeCloseTo(0.5);
    }
  });

  it("maps silence to all zeros", () => {
    const data = new Float32Array(500);
    const peaks = computePeaks(data, 100);
    expect(peaks.every((p) => p === 0)).toBe(true);
  });

  it("takes the maximum absolute magnitude per bucket", () => {
    const data = new Float32Array([0.1, -0.9, 0.3, 0.2]);
    const peaks = computePeaks(data, 2);
    expect(peaks[0]).toBeCloseTo(0.9);
    expect(peaks[1]).toBeCloseTo(0.3);
  });

  it("clamps magnitudes above full scale to 1", () => {
    const data = new Float32Array([2, -3]);
    expect(computePeaks(data, 1)).toEqual([1]);
  });

  it("returns zero-filled buckets when there are more buckets than samples", () => {
    const data = new Float32Array([1, 1]);
    const peaks = computePeaks(data, 4);
    expect(peaks).toHaveLength(4);
    expect(peaks.filter((p) => p === 0).length).toBeGreaterThan(0);
  });

  it("returns an empty array for non-positive bucket counts", () => {
    expect(computePeaks(new Float32Array(10), 0)).toEqual([]);
    expect(computePeaks(new Float32Array(10), -5)).toEqual([]);
  });
});
