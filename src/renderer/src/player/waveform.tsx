import type { PeaksData } from "@shared/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { fractionToTime, timeToFraction } from "./time";

interface WaveformProps {
  drumVolume: number;
  durationSec: number;
  onSeek: (sec: number) => void;
  peaks: PeaksData | null;
  positionSec: number;
  restVolume: number;
}

const LANE_GAP = 10;
const HEAD_RADIUS = 5;
const CENTER_LINE_ALPHA = 0.28;
const LANE_FILL_ALPHA = 0.85;
// Volume maps to lane opacity, not height. A muted lane stays clearly visible
// (never fully transparent) — it just dims toward this floor.
const LANE_MIN_ALPHA = 0.18;

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function drawLane(
  ctx: CanvasRenderingContext2D,
  buckets: number[],
  volume: number,
  top: number,
  laneHeight: number,
  width: number,
  color: string,
  baselineColor: string
): void {
  const centerY = top + laneHeight / 2;
  const half = laneHeight / 2;

  ctx.strokeStyle = baselineColor;
  ctx.globalAlpha = CENTER_LINE_ALPHA;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(width, centerY);
  ctx.stroke();

  if (buckets.length === 0) {
    ctx.globalAlpha = 1;
    return;
  }

  ctx.strokeStyle = color;
  // Full-height waveform; volume only controls how opaque the lane is.
  ctx.globalAlpha =
    LANE_MIN_ALPHA + volume * (LANE_FILL_ALPHA - LANE_MIN_ALPHA);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let px = 0; px < width; px += 1) {
    const startBucket = Math.floor((px / width) * buckets.length);
    const endBucket = Math.max(
      startBucket + 1,
      Math.floor(((px + 1) / width) * buckets.length)
    );
    let peak = 0;
    for (let b = startBucket; b < endBucket && b < buckets.length; b += 1) {
      if (buckets[b] > peak) {
        peak = buckets[b];
      }
    }
    const amp = peak * half;
    const x = px + 0.5;
    ctx.moveTo(x, centerY - amp);
    ctx.lineTo(x, centerY + amp);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function Waveform({
  peaks,
  positionSec,
  durationSec,
  drumVolume,
  restVolume,
  onSeek,
}: WaveformProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);
  const [size, setSize] = useState({ height: 0, width: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        setSize({ height: rect.height, width: rect.width });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0 || size.height === 0) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.width * dpr);
    canvas.height = Math.floor(size.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    const drumColor = cssVar("--color-drum", "#f5a623");
    const restColor = cssVar("--color-rest", "#5b8def");
    const foreground = cssVar("--color-foreground", "#e8eaed");
    const border = cssVar("--color-border", "#23262f");

    const laneHeight = (size.height - LANE_GAP) / 2;
    drawLane(
      ctx,
      peaks?.drums ?? [],
      drumVolume,
      0,
      laneHeight,
      size.width,
      drumColor,
      border
    );
    drawLane(
      ctx,
      peaks?.rest ?? [],
      restVolume,
      laneHeight + LANE_GAP,
      laneHeight,
      size.width,
      restColor,
      border
    );

    const fraction = timeToFraction(positionSec, durationSec);
    const playheadX = fraction * size.width;
    const clampedX = Math.min(
      size.width - HEAD_RADIUS,
      Math.max(HEAD_RADIUS, playheadX)
    );
    ctx.strokeStyle = foreground;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(clampedX, 0);
    ctx.lineTo(clampedX, size.height);
    ctx.stroke();

    ctx.fillStyle = foreground;
    ctx.beginPath();
    ctx.arc(clampedX, HEAD_RADIUS, HEAD_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }, [peaks, positionSec, durationSec, drumVolume, restVolume, size]);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const fraction = (clientX - rect.left) / rect.width;
      onSeek(fractionToTime(fraction, durationSec));
    },
    [durationSec, onSeek]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      seekFromClientX(event.clientX);
    },
    [seekFromClientX]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (draggingRef.current) {
        seekFromClientX(event.clientX);
      }
    },
    [seekFromClientX]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      draggingRef.current = false;
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    []
  );

  return (
    <div className="h-40 w-full" ref={containerRef}>
      <canvas
        aria-label="Waveform — click or drag to seek"
        className="h-full w-full cursor-pointer touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={canvasRef}
      />
    </div>
  );
}
