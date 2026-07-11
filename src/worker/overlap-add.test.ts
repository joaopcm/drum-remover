import { describe, expect, it } from "vitest";
import {
  makeTransitionWindow,
  planSegments,
  weightedOverlapAdd,
} from "./overlap-add";

const SEGMENT = 8;
const STRIDE = 6; // segment - overlap(2)

/** Identity model: echoes the input as `nStems` copies (channel-major). */
function identityRunner(nStems: number, numChannels: number, segment: number) {
  return (mixSegment: Float32Array): Float32Array => {
    const out = new Float32Array(nStems * numChannels * segment);
    for (let s = 0; s < nStems; s += 1) {
      out.set(mixSegment, s * numChannels * segment);
    }
    return out;
  };
}

describe("makeTransitionWindow", () => {
  it("fades in and out with a flat middle", () => {
    const window = makeTransitionWindow(SEGMENT, 0.25);
    expect(Array.from(window)).toEqual([0, 1, 1, 1, 1, 1, 1, 0]);
  });

  it("is all ones when there is no transition", () => {
    expect(Array.from(makeTransitionWindow(4, 0))).toEqual([1, 1, 1, 1]);
  });
});

describe("planSegments", () => {
  it("covers the whole signal with overlapping segments", () => {
    const plans = planSegments(20, SEGMENT, STRIDE);
    expect(plans.map((p) => p.start)).toEqual([0, 6, 12, 18]);
    expect(plans.at(-1)?.length).toBe(2);
  });

  it("always yields at least one segment", () => {
    expect(planSegments(0, SEGMENT, STRIDE)).toHaveLength(1);
  });
});

describe("weightedOverlapAdd", () => {
  const window = makeTransitionWindow(SEGMENT, 0.25);

  it("reconstructs a constant to a constant (interior samples)", async () => {
    const value = 0.37;
    const mix = [new Float32Array(20).fill(value)];
    const [stem] = await weightedOverlapAdd({
      mix,
      nStems: 1,
      runSegment: identityRunner(1, 1, SEGMENT),
      segment: SEGMENT,
      stride: STRIDE,
      window,
    });
    for (let i = 1; i < 20; i += 1) {
      expect(stem[0][i]).toBeCloseTo(value, 5);
    }
  });

  it("preserves a sine wave within tolerance", async () => {
    const length = 40;
    const mix = [Float32Array.from({ length }, (_, i) => Math.sin(i * 0.3))];
    const [stem] = await weightedOverlapAdd({
      mix,
      nStems: 1,
      runSegment: identityRunner(1, 1, SEGMENT),
      segment: SEGMENT,
      stride: STRIDE,
      window,
    });
    for (let i = 1; i < length; i += 1) {
      expect(stem[0][i]).toBeCloseTo(Math.sin(i * 0.3), 5);
    }
  });

  it("keeps stems and channels independent", async () => {
    const left = Float32Array.from({ length: 20 }, (_, i) => i / 20);
    const right = Float32Array.from({ length: 20 }, (_, i) => -i / 20);
    const runSegment = (mixSegment: Float32Array): Float32Array => {
      // stem 0 = passthrough, stem 1 = negated.
      const out = new Float32Array(2 * 2 * SEGMENT);
      out.set(mixSegment, 0);
      for (let i = 0; i < mixSegment.length; i += 1) {
        out[2 * SEGMENT + i] = -mixSegment[i];
      }
      return out;
    };
    const stems = await weightedOverlapAdd({
      mix: [left, right],
      nStems: 2,
      runSegment,
      segment: SEGMENT,
      stride: STRIDE,
      window,
    });
    for (let i = 1; i < 20; i += 1) {
      expect(stems[0][0][i]).toBeCloseTo(left[i], 5);
      expect(stems[0][1][i]).toBeCloseTo(right[i], 5);
      expect(stems[1][0][i]).toBeCloseTo(-left[i], 5);
      expect(stems[1][1][i]).toBeCloseTo(-right[i], 5);
    }
  });
});
