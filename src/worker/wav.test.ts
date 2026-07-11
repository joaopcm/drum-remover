import { describe, expect, it } from "vitest";
import { decodeWav, encodeWav } from "./wav";

const SAMPLE_RATE = 44_100;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

describe("wav codec", () => {
  it("round-trips stereo float32 audio within tolerance", () => {
    const length = 2048;
    const left = Float32Array.from({ length }, (_, i) => Math.sin(i * 0.1));
    const right = Float32Array.from(
      { length },
      (_, i) => Math.cos(i * 0.05) * 0.5
    );

    const decoded = decodeWav(
      toArrayBuffer(encodeWav([left, right], SAMPLE_RATE))
    );

    expect(decoded.sampleRate).toBe(SAMPLE_RATE);
    expect(decoded.channels).toHaveLength(2);
    expect(decoded.channels[0]).toHaveLength(length);
    for (let i = 0; i < length; i += 1) {
      expect(decoded.channels[0][i]).toBeCloseTo(left[i], 5);
      expect(decoded.channels[1][i]).toBeCloseTo(right[i], 5);
    }
  });

  it("preserves full-scale and out-of-range float samples exactly", () => {
    const mono = Float32Array.from([-1, -0.5, 0, 0.5, 1, 1.5, -2]);
    const decoded = decodeWav(toArrayBuffer(encodeWav([mono], SAMPLE_RATE)));
    expect(decoded.channels[0]).toHaveLength(mono.length);
    for (let i = 0; i < mono.length; i += 1) {
      expect(decoded.channels[0][i]).toBe(mono[i]);
    }
  });

  it("throws on non-RIFF input", () => {
    expect(() => decodeWav(new ArrayBuffer(4))).toThrow();
  });
});
