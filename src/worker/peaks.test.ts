import { describe, expect, it } from "vitest";
import { computePeaks, samplesPerBucket, toMono } from "./peaks";

describe("computePeaks", () => {
  it("reduces a constant channel to a constant array of 1s", () => {
    const channel = new Float32Array(1000).fill(0.42);
    const peaks = computePeaks(channel, 50);
    expect(peaks).toHaveLength(50);
    for (const value of peaks) {
      expect(value).toBeCloseTo(1, 6);
    }
  });

  it("reduces silence to all zeros", () => {
    const peaks = computePeaks(new Float32Array(1000), 50);
    expect(peaks).toHaveLength(50);
    expect(peaks.every((v) => v === 0)).toBe(true);
  });

  it("always returns exactly `buckets` values", () => {
    expect(computePeaks(new Float32Array(3), 2000)).toHaveLength(2000);
    expect(computePeaks(new Float32Array(10_000), 2000)).toHaveLength(2000);
    expect(computePeaks(new Float32Array(0), 2000)).toHaveLength(2000);
  });

  it("normalizes to the loudest bucket", () => {
    const channel = Float32Array.from([0.1, 0.1, 0.5, 0.5, 1, 1]);
    const peaks = computePeaks(channel, 3);
    expect(peaks[0]).toBeCloseTo(0.1, 6);
    expect(peaks[1]).toBeCloseTo(0.5, 6);
    expect(peaks[2]).toBeCloseTo(1, 6);
  });
});

describe("samplesPerBucket", () => {
  it("divides length across buckets, rounding up", () => {
    expect(samplesPerBucket(10_000, 2000)).toBe(5);
    expect(samplesPerBucket(2001, 2000)).toBe(2);
    expect(samplesPerBucket(0, 2000)).toBe(0);
  });
});

describe("toMono", () => {
  it("returns the single channel unchanged for mono", () => {
    const mono = Float32Array.from([1, 2, 3]);
    expect(toMono([mono])).toBe(mono);
  });

  it("averages stereo channels", () => {
    const left = Float32Array.from([1, 0, -1]);
    const right = Float32Array.from([1, 1, 1]);
    const mono = toMono([left, right]);
    expect(Array.from(mono)).toEqual([1, 0.5, 0]);
  });
});
