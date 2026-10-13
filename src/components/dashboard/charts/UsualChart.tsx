"use client";

// One day against the usual: the site's L90–L10 band per clock hour (as
// judged, floor included) with its typical level dashed through it, the
// day's hourly levels as a line over it, and the moment on display as a dot.
// The band and the pill on the map come from the same rule
// (src/lib/dashboard/usual.ts), so the chart can never disagree with the
// circle.

import { useEffect, useMemo, useRef, useState } from "react";
import { levelColor, paletteStops } from "@/lib/dashboard/levels";
import { usualEdges } from "@/lib/dashboard/usual";
import type { UsualBand } from "@/lib/api/dashboard";

const H = 96;
const PAD_L = 22;
const PAD_R = 6;
const PAD_T = 8;
const PAD_B = 16;

function useMeasuredWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export default function UsualChart({
  profile,
  day,
  nowFraction,
  nowLevel,
}: {
  /** The band per clock hour; hours without enough history are absent. */
  profile: Record<number, UsualBand>;
  /** The day's hourly energy means, index = clock hour; null = no readings. */
  day: (number | null)[];
  /** The moment on display as a fraction of the day (hour + minutes/60). */
  nowFraction: number;
  /** The level shown for that moment (the circle's value); null = none. */
  nowLevel: number | null;
}) {
  const [ref, width] = useMeasuredWidth();
  const stops = useMemo(() => paletteStops(), []);

  const geom = useMemo(() => {
    if (width === 0) return null;
    const innerW = width - PAD_L - PAD_R;
    const innerH = H - PAD_T - PAD_B;
    let lo = Infinity;
    let hi = -Infinity;
    for (let h = 0; h < 24; h++) {
      const b = profile[h];
      if (b) {
        const e = usualEdges(b);
        lo = Math.min(lo, e.lo);
        hi = Math.max(hi, e.hi);
      }
      const v = day[h];
      if (v != null) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    if (nowLevel != null) {
      lo = Math.min(lo, nowLevel);
      hi = Math.max(hi, nowLevel);
    }
    if (!Number.isFinite(lo)) return null;
    lo = Math.floor((lo - 2) / 5) * 5;
    hi = Math.ceil((hi + 2) / 5) * 5;
    const x = (hour: number) => PAD_L + (hour / 24) * innerW;
    const y = (v: number) => PAD_T + innerH * (1 - (v - lo) / (hi - lo));

    // The band: through the hour centres, forward along the top edge and
    // back along the bottom. Hours without a band break it.
    const bandRuns: string[] = [];
    const medianRuns: string[] = [];
    let top: string[] = [];
    let bottom: string[] = [];
    let median: string[] = [];
    const flush = () => {
      if (top.length > 0) {
        bandRuns.push(`M${top.join(" L")} L${bottom.reverse().join(" L")} Z`);
        medianRuns.push(`M${median.join(" L")}`);
      }
      top = [];
      bottom = [];
      median = [];
    };
    for (let h = 0; h < 24; h++) {
      const b = profile[h];
      if (!b) {
        flush();
        continue;
      }
      const e = usualEdges(b);
      const cx = x(h + 0.5).toFixed(1);
      top.push(`${cx} ${y(e.hi).toFixed(1)}`);
      bottom.push(`${cx} ${y(e.lo).toFixed(1)}`);
      median.push(`${cx} ${y(b.l50).toFixed(1)}`);
    }
    flush();

    // The day's line, broken at missing hours.
    const dayRuns: string[] = [];
    let run: string[] = [];
    for (let h = 0; h < 24; h++) {
      const v = day[h];
      if (v == null) {
        if (run.length > 0) dayRuns.push(`M${run.join(" L")}`);
        run = [];
        continue;
      }
      run.push(`${x(h + 0.5).toFixed(1)} ${y(v).toFixed(1)}`);
    }
    if (run.length > 0) dayRuns.push(`M${run.join(" L")}`);

    const ticks: number[] = [];
    for (let v = Math.ceil(lo / 10) * 10; v <= hi; v += 10) ticks.push(v);
    return { x, y, bandRuns, medianRuns, dayRuns, ticks };
  }, [width, profile, day, nowLevel]);

  return (
    <div ref={ref} className="w-full">
      {geom && (
        <svg width={width} height={H} role="img" className="block overflow-visible">
          {geom.ticks.map((v) => (
            <g key={v}>
              <line x1={PAD_L} x2={width - PAD_R} y1={geom.y(v)} y2={geom.y(v)} stroke="var(--border)" strokeWidth={0.6} />
              <text x={PAD_L - 4} y={geom.y(v) + 3} textAnchor="end" fontSize={8} fill="var(--muted-foreground)" className="tabular-nums">
                {v}
              </text>
            </g>
          ))}
          {geom.bandRuns.map((d, i) => (
            <path key={`b${i}`} d={d} fill="var(--sw-sound)" opacity={0.16} />
          ))}
          {geom.medianRuns.map((d, i) => (
            <path key={`m${i}`} d={d} fill="none" stroke="var(--sw-sound)" strokeWidth={1} strokeDasharray="3 3" />
          ))}
          {geom.dayRuns.map((d, i) => (
            <path key={`d${i}`} d={d} fill="none" stroke="var(--sw-ink)" strokeWidth={1.8} strokeLinejoin="round" />
          ))}
          {nowLevel != null && (
            <circle cx={geom.x(nowFraction)} cy={geom.y(nowLevel)} r={3.5} fill={levelColor(nowLevel, stops)} stroke="var(--sw-paper)" strokeWidth={1} />
          )}
          {[0, 6, 12, 18, 24].map((h) => (
            <text
              key={h}
              x={geom.x(h)}
              y={H - 4}
              textAnchor={h === 0 ? "start" : h === 24 ? "end" : "middle"}
              fontSize={8}
              fill="var(--muted-foreground)"
              className="tabular-nums"
            >
              {String(h).padStart(2, "0")}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}
