import { describe, expect, it } from "vitest";
import {
  clampTime,
  currentPosition,
  fractionToTime,
  offsetToTime,
  timeToFraction,
} from "./time";

describe("clampTime", () => {
  it("keeps in-range values", () => {
    expect(clampTime(5, 10)).toBe(5);
  });

  it("floors negatives and non-finite values to 0", () => {
    expect(clampTime(-1, 10)).toBe(0);
    expect(clampTime(Number.NaN, 10)).toBe(0);
    expect(clampTime(Number.POSITIVE_INFINITY, 10)).toBe(0);
  });

  it("caps at the duration", () => {
    expect(clampTime(12, 10)).toBe(10);
  });
});

describe("currentPosition", () => {
  it("tracks elapsed context time from the start offset", () => {
    expect(
      currentPosition({
        durationSec: 10,
        nowCtxTime: 105,
        startCtxTime: 100,
        startOffsetSec: 2,
      })
    ).toBeCloseTo(7);
  });

  it("clamps to the duration at the end of the track", () => {
    expect(
      currentPosition({
        durationSec: 10,
        nowCtxTime: 200,
        startCtxTime: 100,
        startOffsetSec: 0,
      })
    ).toBe(10);
  });
});

describe("fractionToTime / timeToFraction", () => {
  it("round-trips a mid value", () => {
    expect(fractionToTime(0.5, 120)).toBe(60);
    expect(timeToFraction(60, 120)).toBeCloseTo(0.5);
  });

  it("clamps out-of-range fractions", () => {
    expect(fractionToTime(-0.2, 100)).toBe(0);
    expect(fractionToTime(1.5, 100)).toBe(100);
  });

  it("returns 0 fraction for a zero duration", () => {
    expect(timeToFraction(5, 0)).toBe(0);
  });
});

describe("offsetToTime", () => {
  it("maps a click at the track midpoint to half the duration", () => {
    expect(offsetToTime(100, 200, 120)).toBe(60);
  });

  it("clamps clicks past either edge of the track", () => {
    expect(offsetToTime(-20, 200, 120)).toBe(0);
    expect(offsetToTime(260, 200, 120)).toBe(120);
  });

  it("seeks to the start when the track has no width yet", () => {
    expect(offsetToTime(50, 0, 120)).toBe(0);
  });
});
