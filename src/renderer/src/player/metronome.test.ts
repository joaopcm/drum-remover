import { describe, expect, it } from "vitest";
import { beatsToSampleIndices } from "./metronome";

describe("beatsToSampleIndices", () => {
  it("converts beat times to sample indices at the given rate", () => {
    expect(beatsToSampleIndices([0, 0.5, 1], 1000, 10_000)).toEqual([
      0, 500, 1000,
    ]);
  });

  it("returns indices in ascending order regardless of input order", () => {
    expect(beatsToSampleIndices([1, 0, 0.5], 1000, 10_000)).toEqual([
      0, 500, 1000,
    ]);
  });

  it("drops beats that fall outside [0, totalSamples)", () => {
    expect(beatsToSampleIndices([-1, 5, 15], 1000, 10_000)).toEqual([5000]);
  });

  it("drops non-finite beat times", () => {
    expect(
      beatsToSampleIndices(
        [0, Number.NaN, Number.POSITIVE_INFINITY],
        1000,
        10_000
      )
    ).toEqual([0]);
  });

  it("deduplicates beats that round to the same sample", () => {
    expect(beatsToSampleIndices([0.5001, 0.5002], 1000, 10_000)).toEqual([500]);
  });

  it("returns an empty array for an empty beat list", () => {
    expect(beatsToSampleIndices([], 1000, 10_000)).toEqual([]);
  });
});
