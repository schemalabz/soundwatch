"use client";

// The round chart primitive: N slices around a ring, each a donut sector
// whose radial extent and color encode a dB level. One component drives the
// 24-hour clock, the Mon-Sun week rose and the 12-month wheel — same
// geometry, same hover behavior, same muting language as the timebar
// (filtered-out slices collapse to a silver stub).
//
// The center is the readout: idle it presents the loudest slice, hovering
// any slice inspects it. No tooltips floating over geometry.

import { useMemo, useState } from "react";
import { DEFAULT_STOPS, levelColor, paletteStops } from "@/lib/dashboard/levels";
import { fmtDb } from "@/lib/dashboard/format";

export interface RadialSlice {
  label: string;
  /** Shown in the center readout (defaults to label). */
  readout?: string;
  /** dB value, or null when the bucket has no data. */
  value: number | null;
  n: number;
  /** Filtered out by the rail — renders as a stub, never as data. */
  muted: boolean;
  /** Draw this slice's label around the ring. */
  showLabel?: boolean;
}

// Radius shares the ramp with colour. These were 36 and 86 while levels.ts
// moved to 35 and 100, so with the Μέγιστη metric an lmax_est of 92.7, 106.2
// and 111.0 all drew the same maximum radius — every slice identical, which is
// the exact saturation this branch set out to remove. Colour came from
// levelColor on the new range, radius from the old one: two channels
// disagreeing about the same slice.
const DB_MIN = DEFAULT_STOPS.minDb;
const DB_MAX = DEFAULT_STOPS.maxDb;

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/** Donut sector path between two radii and two angles (degrees). */
function sectorPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x0o, y0o] = polar(cx, cy, r1, a0);
  const [x1o, y1o] = polar(cx, cy, r1, a1);
  const [x1i, y1i] = polar(cx, cy, r0, a1);
  const [x0i, y0i] = polar(cx, cy, r0, a0);
  return `M ${x0o} ${y0o} A ${r1} ${r1} 0 ${large} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${r0} ${r0} 0 ${large} 0 ${x0i} ${y0i} Z`;
}

export default function RadialChart({
  slices,
  caption,
  size = 250,
}: {
  slices: RadialSlice[];
  /** Caption under the center value when idle (e.g. "πιο θορυβώδης"). */
  caption: string;
  size?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const stops = useMemo(() => paletteStops(), []);

  const cx = size / 2;
  const cy = size / 2;
  const rInner = size * 0.252;
  const rOuter = size * 0.46;
  const stubR = rInner + 4;
  const n = slices.length;
  const step = 360 / n;
  const gap = n > 12 ? 1.6 : 2.4; // degrees between slices

  const radiusFor = (v: number) => {
    const f = Math.min(1, Math.max(0, (v - DB_MIN) / (DB_MAX - DB_MIN)));
    return rInner + 5 + f * (rOuter - rInner - 5);
  };

  const loudest = useMemo(() => {
    let best: number | null = null;
    slices.forEach((s, i) => {
      if (s.value != null && (best == null || s.value > (slices[best].value as number))) best = i;
    });
    return best;
  }, [slices]);

  const focus = hovered != null && slices[hovered].value != null ? hovered : loudest;
  const focusSlice = focus != null ? slices[focus] : null;

  // dB grid rings at 50 / 70.
  const gridLevels = [50, 70];

  return (
    <svg
      viewBox={`-14 -14 ${size + 28} ${size + 28}`}
      className="w-full max-w-[18rem]"
      role="img"
      onMouseLeave={() => setHovered(null)}
    >
      {gridLevels.map((g) => (
        <circle
          key={g}
          cx={cx}
          cy={cy}
          r={radiusFor(g)}
          fill="none"
          className="stroke-border"
          strokeDasharray="2 3.5"
          strokeWidth={1}
        />
      ))}

      {slices.map((s, i) => {
        // Slice i occupies [-90° + i·step, +step), gap split on both sides.
        const a0 = -90 + i * step + gap / 2;
        const a1 = -90 + (i + 1) * step - gap / 2;
        const mid = (a0 + a1) / 2;
        const active = hovered === i || (hovered == null && focus === i);

        return (
          <g key={i}>
            {/* hairline base arc keeps the wheel legible where data is absent */}
            <path d={sectorPath(cx, cy, rInner, rInner + 1.5, a0, a1)} className="fill-border" />
            {s.muted ? (
              <path d={sectorPath(cx, cy, rInner, stubR, a0, a1)} className="fill-silver/45" />
            ) : s.value != null ? (
              <path
                d={sectorPath(cx, cy, rInner, radiusFor(s.value), a0, a1)}
                fill={levelColor(s.value, stops)}
                opacity={active ? 1 : 0.62}
                style={{ transition: "opacity 140ms ease" }}
              />
            ) : null}
            {/* invisible full-extent hit area so thin slices stay hoverable */}
            {!s.muted && s.value != null && (
              <path
                d={sectorPath(cx, cy, rInner, rOuter + 6, a0, a1)}
                fill="transparent"
                onMouseEnter={() => setHovered(i)}
              />
            )}
            {s.showLabel && (
              <text
                x={polar(cx, cy, rOuter + 9, mid)[0]}
                y={polar(cx, cy, rOuter + 9, mid)[1]}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-muted-foreground text-[8px] font-medium tabular-nums"
              >
                {s.label}
              </text>
            )}
          </g>
        );
      })}

      {/* center readout */}
      {focusSlice && focusSlice.value != null ? (
        <>
          <text x={cx} y={cy - 13} textAnchor="middle" className="fill-muted-foreground text-[9.5px] font-medium">
            {focusSlice.readout ?? focusSlice.label}
          </text>
          <text x={cx} y={cy + 7} textAnchor="middle" className="fill-foreground text-[21px] font-bold tabular-nums">
            {fmtDb(focusSlice.value)}
          </text>
          <text x={cx} y={cy + 22} textAnchor="middle" className="fill-muted-foreground text-[8.5px]">
            {hovered != null ? "dB" : `dB · ${caption}`}
          </text>
        </>
      ) : (
        <text x={cx} y={cy + 3} textAnchor="middle" className="fill-muted-foreground text-[10px]">
          —
        </text>
      )}
    </svg>
  );
}
