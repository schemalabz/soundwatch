"use client";

// The time-series chart: selected metric as a line over the filtered
// domain, floating on the L90–L10 envelope (the band between background
// and loud-tail levels). Timestamps arrive as Athens wall time encoded as
// UTC — every formatter here MUST use timeZone: "UTC".
//
// Filter gaps are honest: buckets that aren't adjacent in time break the
// line and the band, exactly like the muted washes on the timebar.

import { useEffect, useMemo, useRef, useState } from "react";
import { levelColor, paletteStops } from "@/lib/dashboard/levels";
import { fmtDb, fmtInt } from "@/lib/dashboard/format";
import { LOCALE, dashboardStrings as tr } from "@/lib/strings/dashboard";
import type { AggKey } from "../Timebar";
import type { SeriesPoint } from "./types";

const H = 200;
const PAD_L = 30;
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 22;

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

export default function TimelineChart({
  points,
  metric,
  bucket,
}: {
  points: SeriesPoint[];
  metric: AggKey;
  bucket: "hour" | "day";
}) {
  const [ref, width] = useMeasuredWidth();
  const [hovered, setHovered] = useState<number | null>(null);
  const stops = useMemo(() => paletteStops(), []);

  const fmtTick = useMemo(
    () =>
      new Intl.DateTimeFormat(
        LOCALE,
        bucket === "hour"
          ? { timeZone: "UTC", weekday: "short", hour: "2-digit", minute: "2-digit" }
          : { timeZone: "UTC", day: "numeric", month: "short" }
      ),
    [bucket]
  );
  const fmtFull = useMemo(
    () =>
      new Intl.DateTimeFormat(
        LOCALE,
        bucket === "hour"
          ? { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
          : { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }
      ),
    [bucket]
  );

  const geom = useMemo(() => {
    if (points.length === 0 || width === 0) return null;
    const innerW = width - PAD_L - PAD_R;
    const innerH = H - PAD_T - PAD_B;

    let lo = Infinity;
    let hi = -Infinity;
    for (const p of points) {
      lo = Math.min(lo, p.l90, p[metric]);
      hi = Math.max(hi, p.l10, p[metric]);
    }
    lo = Math.floor((lo - 2) / 5) * 5;
    hi = Math.ceil((hi + 2) / 5) * 5;

    const x = (i: number) => PAD_L + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (v: number) => PAD_T + innerH * (1 - (v - lo) / (hi - lo));

    // Split into runs of time-adjacent buckets: a jump larger than one
    // bucket means the filters excluded the span in between.
    const bucketMs = bucket === "hour" ? 3600_000 : 86_400_000;
    const runs: number[][] = [];
    let run: number[] = [0];
    for (let i = 1; i < points.length; i++) {
      if (points[i].t - points[i - 1].t > bucketMs * 1.5) {
        runs.push(run);
        run = [];
      }
      run.push(i);
    }
    runs.push(run);

    const linePaths: string[] = [];
    const bandPaths: string[] = [];
    for (const r of runs) {
      if (r.length === 1) {
        const i = r[0];
        // A lone bucket has no line — mark it with a short dash.
        linePaths.push(`M ${x(i) - 2.5} ${y(points[i][metric])} L ${x(i) + 2.5} ${y(points[i][metric])}`);
        continue;
      }
      linePaths.push(r.map((i, k) => `${k === 0 ? "M" : "L"} ${x(i)} ${y(points[i][metric])}`).join(" "));
      const up = r.map((i, k) => `${k === 0 ? "M" : "L"} ${x(i)} ${y(points[i].l10)}`).join(" ");
      const down = [...r]
        .reverse()
        .map((i) => `L ${x(i)} ${y(points[i].l90)}`)
        .join(" ");
      bandPaths.push(`${up} ${down} Z`);
    }

    // ~6 x-axis ticks aligned to run starts where possible.
    const tickEvery = Math.max(1, Math.round(points.length / 6));
    const ticks = points.map((_, i) => i).filter((i) => i % tickEvery === 0);

    const gridLevels: number[] = [];
    for (let g = lo; g <= hi; g += 10) if (g % 10 === 0) gridLevels.push(g);

    return { x, y, lo, hi, runs, linePaths, bandPaths, ticks, gridLevels, innerW };
  }, [points, width, metric, bucket]);

  if (points.length === 0) {
    return <div className="py-10 text-center text-[12px] text-muted-foreground">{tr.charts.noData}</div>;
  }

  const hoveredPoint = hovered != null ? points[hovered] : null;

  return (
    <div ref={ref} className="relative w-full">
      <svg
        viewBox={`0 0 ${Math.max(width, 1)} ${H}`}
        width={Math.max(width, 1)}
        height={H}
        role="img"
        onMouseMove={(e) => {
          if (!geom) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const idx = Math.round(((px - PAD_L) / Math.max(1, geom.innerW)) * (points.length - 1));
          setHovered(Math.max(0, Math.min(points.length - 1, idx)));
        }}
        onMouseLeave={() => setHovered(null)}
      >
        {geom && (
          <>
            {geom.gridLevels.map((g) => (
              <g key={g}>
                <line
                  x1={PAD_L}
                  x2={width - PAD_R}
                  y1={geom.y(g)}
                  y2={geom.y(g)}
                  className="stroke-border"
                  strokeDasharray="2 4"
                  strokeWidth={1}
                />
                <text
                  x={PAD_L - 6}
                  y={geom.y(g)}
                  textAnchor="end"
                  dominantBaseline="central"
                  className="fill-muted-foreground text-[8.5px] tabular-nums"
                >
                  {g}
                </text>
              </g>
            ))}

            {geom.bandPaths.map((d, i) => (
              <path key={`b${i}`} d={d} className="fill-silver/35" />
            ))}
            {geom.linePaths.map((d, i) => (
              <path
                key={`l${i}`}
                d={d}
                fill="none"
                className="stroke-foreground"
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}

            {geom.ticks.map((i) => (
              <text
                key={`t${i}`}
                x={geom.x(i)}
                y={H - 7}
                textAnchor="middle"
                className="fill-muted-foreground text-[8.5px] tabular-nums"
              >
                {fmtTick.format(points[i].t)}
              </text>
            ))}

            {hoveredPoint && hovered != null && (
              <g>
                <line
                  x1={geom.x(hovered)}
                  x2={geom.x(hovered)}
                  y1={PAD_T}
                  y2={H - PAD_B}
                  className="stroke-foreground/25"
                  strokeWidth={1}
                />
                <circle
                  cx={geom.x(hovered)}
                  cy={geom.y(hoveredPoint[metric])}
                  r={3.5}
                  fill={levelColor(hoveredPoint[metric], stops)}
                  className="stroke-background"
                  strokeWidth={1.5}
                />
              </g>
            )}
          </>
        )}
      </svg>

      {/* hover readout: a fixed strip, nothing floats over the geometry */}
      <div className="flex h-5 items-baseline gap-2 text-[10.5px] text-muted-foreground">
        {hoveredPoint ? (
          <>
            <span className="font-medium text-foreground">{fmtFull.format(hoveredPoint.t)}</span>
            <span className="font-semibold tabular-nums" style={{ color: levelColor(hoveredPoint[metric], stops) }}>
              {fmtDb(hoveredPoint[metric])} dB
            </span>
            <span className="tabular-nums">{tr.board.measurements(fmtInt(hoveredPoint.n))}</span>
          </>
        ) : (
          <span>
            — {tr.aggregations[metric].hint} · {tr.charts.timelineBand}
          </span>
        )}
      </div>
    </div>
  );
}
