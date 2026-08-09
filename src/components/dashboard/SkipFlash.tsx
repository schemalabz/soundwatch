"use client";

// The time-jump cut: when playback skips a filter-excluded gap, the map
// freezes for a beat as a chunky Bayer-dithered still (palette duotone),
// with the landing date and a fast-forward mark stamped over it — a visible
// "we just jumped" so the discontinuity reads as intentional, not a glitch.
//
// Hand-rolled on a 2D canvas instead of a dither library: the map lives in
// its own WebGL context, which html-in-canvas capture components handle
// poorly — reading mapbox's canvas directly (preserveDrawingBuffer) into a
// tiny buffer and upscaling with smoothing off is cheap and dependency-free.

import { useEffect, useRef, useState } from "react";
import { FastForward } from "lucide-react";
import { ATHENS_TZ } from "@/lib/dashboard/time";
import { LOCALE } from "@/lib/strings/dashboard";

export interface SkipEvent {
  /** Monotonic id so consecutive skips retrigger the animation. */
  seq: number;
  targetMs: number;
}

const FLASH_MS = 650;
const PIXEL = 7; // display pixels per dither cell
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => (v + 0.5) / 16));

function paletteColor(name: string, fallback: string): [number, number, number] {
  const probe = document.createElement("div");
  probe.style.color = `var(${name}, ${fallback})`;
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color.match(/\d+/g);
  probe.remove();
  return rgb ? ([+rgb[0], +rgb[1], +rgb[2]] as [number, number, number]) : [0, 0, 0];
}

/** Draw `source` into `target` as a two-tone Bayer-dithered chunky still. */
function ditherInto(target: HTMLCanvasElement, source: HTMLCanvasElement): boolean {
  const w = Math.max(8, Math.floor(target.clientWidth / PIXEL));
  const h = Math.max(8, Math.floor(target.clientHeight / PIXEL));
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const sctx = small.getContext("2d", { willReadFrequently: true });
  if (!sctx) return false;
  try {
    sctx.drawImage(source, 0, 0, w, h);
    const img = sctx.getImageData(0, 0, w, h);
    const ink = paletteColor("--sw-ink", "#2d3142");
    const paper = paletteColor("--sw-paper", "#ffffff");
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        const c = lum > BAYER4[y % 4][x % 4] ? paper : ink;
        d[i] = c[0];
        d[i + 1] = c[1];
        d[i + 2] = c[2];
        d[i + 3] = 255;
      }
    }
    sctx.putImageData(img, 0, 0);
  } catch {
    return false; // tainted canvas etc. — fall back to plain overlay
  }
  target.width = target.clientWidth;
  target.height = target.clientHeight;
  const tctx = target.getContext("2d");
  if (!tctx) return false;
  tctx.imageSmoothingEnabled = false;
  tctx.drawImage(small, 0, 0, target.width, target.height);
  return true;
}

export default function SkipFlash({
  skip,
  getMapCanvas,
}: {
  skip: SkipEvent | null;
  getMapCanvas: () => HTMLCanvasElement | null;
}) {
  // `active` is DERIVED (skip minus dismissals) — no state copies in effects;
  // the timer only ever marks the current seq as dismissed, asynchronously.
  const [dismissedSeq, setDismissedSeq] = useState(0);
  const active = skip && skip.seq !== dismissedSeq ? skip : null;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const washRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!skip) return;
    const timer = setTimeout(() => setDismissedSeq(skip.seq), FLASH_MS);
    return () => clearTimeout(timer);
  }, [skip]);

  // Snapshot + dither on activation. Whether the still succeeded toggles
  // canvas/wash visibility imperatively — style writes, not state.
  useEffect(() => {
    if (!active || !canvasRef.current) return;
    const source = getMapCanvas();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ok = !reduced && source != null && ditherInto(canvasRef.current, source);
    canvasRef.current.style.display = ok ? "" : "none";
    if (washRef.current) washRef.current.style.display = ok ? "none" : "";
  }, [active, getMapCanvas]);

  const label = active
    ? new Intl.DateTimeFormat(LOCALE, {
        timeZone: ATHENS_TZ,
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(active.targetMs)
    : "";

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-[5] transition-opacity duration-200 ${
        active ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* frozen dithered still (or a quiet wash when no snapshot is possible) */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ display: "none" }} />
      <div ref={washRef} className="absolute inset-0 bg-ink/20" style={{ display: "none" }} />
      {/* the stamp: fast-forward + landing date */}
      {active && (
        <div
          key={active.seq}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 animate-in fade-in zoom-in-95 duration-200"
        >
          <FastForward className="size-10 text-paper drop-shadow-[0_1px_8px_rgb(45_49_66/0.7)]" fill="currentColor" />
          <div className="rounded-md bg-ink/85 px-3 py-1.5 text-[15px] font-semibold tabular-nums tracking-tight text-paper shadow-lg">
            {label}
          </div>
        </div>
      )}
    </div>
  );
}
