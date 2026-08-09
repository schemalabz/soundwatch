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
import type { AggKey } from "@/lib/dashboard/metrics";
import MetricMention from "../MetricMention";
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
  onMetricRefHover,
}: {
  points: SeriesPoint[];
  metric: AggKey;
  bucket: "hour" | "day";
  onMetricRefHover?: (on: boolean) => void;
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

    // Each run renders as one line whose stroke is a horizontal gradient
    // through the SAME level ramp as the map circles — the line's color IS
    // the value, everywhere along it.
    interface Run {
      path: string;
      band: string | null;
      x0: number;
      x1: number;
      stops: { offset: number; value: number }[];
    }
    const lineRuns: Run[] = [];
    for (const r of runs) {
      const x0 = x(r[0]);
      const x1 = x(r[r.length - 1]);
      if (r.length === 1) {
        const i = r[0];
        // A lone bucket has no line — mark it with a short dash.
        lineRuns.push({
          path: `M ${x(i) - 2.5} ${y(points[i][metric])} L ${x(i) + 2.5} ${y(points[i][metric])}`,
          band: null,
          x0,
          x1,
          stops: [{ offset: 0, value: points[i][metric] }],
        });
        continue;
      }
      const up = r.map((i, k) => `${k === 0 ? "M" : "L"} ${x(i)} ${y(points[i].l10)}`).join(" ");
      const down = [...r]
        .reverse()
        .map((i) => `L ${x(i)} ${y(points[i].l90)}`)
        .join(" ");
      lineRuns.push({
        path: r.map((i, k) => `${k === 0 ? "M" : "L"} ${x(i)} ${y(points[i][metric])}`).join(" "),
        band: `${up} ${down} Z`,
        x0,
        x1,
        stops: r.map((i) => ({ offset: (x(i) - x0) / Math.max(1, x1 - x0), value: points[i][metric] })),
      });
    }

    // Filter-excluded spans between runs: rendered as hatched washes, the
    // same "intentionally muted" language as the timebar.
    const gaps: { gx0: number; gx1: number }[] = [];
    for (let k = 1; k < runs.length; k++) {
      const gx0 = x(runs[k - 1][runs[k - 1].length - 1]) + 5;
      const gx1 = x(runs[k][0]) - 5;
      if (gx1 - gx0 > 8) gaps.push({ gx0, gx1 });
    }

    // ~6 x-axis ticks aligned to run starts where possible.
    const tickEvery = Math.max(1, Math.round(points.length / 6));
    const ticks = points.map((_, i) => i).filter((i) => i % tickEvery === 0);

    const gridLevels: number[] = [];
    for (let g = lo; g <= hi; g += 10) if (g % 10 === 0) gridLevels.push(g);

    return { x, y, lo, hi, runs, lineRuns, gaps, ticks, gridLevels, innerW };
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
            {/* frame: y-axis + baseline, solid but quiet */}
            <line
              x1={PAD_L}
              x2={PAD_L}
              y1={PAD_T}
              y2={H - PAD_B}
              style={{ stroke: "var(--sw-silver)", strokeOpacity: 0.7 }}
              strokeWidth={1}
            />
            <line
              x1={PAD_L}
              x2={width - PAD_R}
              y1={H - PAD_B}
              y2={H - PAD_B}
              style={{ stroke: "var(--sw-silver)", strokeOpacity: 0.7 }}
              strokeWidth={1}
            />

            {geom.gridLevels.map((g) => (
              <g key={g}>
                <line
                  x1={PAD_L}
                  x2={width - PAD_R}
                  y1={geom.y(g)}
                  y2={geom.y(g)}
                  style={{ stroke: "var(--sw-silver)", strokeOpacity: 0.4 }}
                  strokeDasharray="2 4"
                  strokeWidth={1}
                />
                <line
                  x1={PAD_L - 3.5}
                  x2={PAD_L}
                  y1={geom.y(g)}
                  y2={geom.y(g)}
                  style={{ stroke: "var(--sw-silver)", strokeOpacity: 0.9 }}
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

            <defs>
              {/* the envelope: warm at the loud edge, silver at the floor */}
              <linearGradient id="sw-tl-band" x1="0" y1={PAD_T} x2="0" y2={H - PAD_B} gradientUnits="userSpaceOnUse">
                <stop offset="0" style={{ stopColor: "var(--sw-sound)", stopOpacity: 0.14 }} />
                <stop offset="1" style={{ stopColor: "var(--sw-silver)", stopOpacity: 0.3 }} />
              </linearGradient>
              {/* excluded-period hatch, the timebar's muting language */}
              <pattern id="sw-tl-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: "var(--sw-silver)", strokeOpacity: 0.55 }} strokeWidth="1.2" />
              </pattern>
              {/* per-run stroke gradients through the level color ramp */}
              {geom.lineRuns.map((r, i) => (
                <linearGradient
                  key={`g${i}`}
                  id={`sw-tl-line-${i}`}
                  x1={r.x0}
                  x2={Math.max(r.x1, r.x0 + 1)}
                  y1="0"
                  y2="0"
                  gradientUnits="userSpaceOnUse"
                >
                  {r.stops.map((s, k) => (
                    <stop key={k} offset={s.offset} stopColor={levelColor(s.value, stops)} />
                  ))}
                </linearGradient>
              ))}
            </defs>

            {geom.gaps.map((g, i) => (
              <rect
                key={`gap${i}`}
                x={g.gx0}
                y={PAD_T}
                width={g.gx1 - g.gx0}
                height={H - PAD_T - PAD_B}
                rx={3}
                fill="url(#sw-tl-hatch)"
              />
            ))}
            {geom.lineRuns.map((r, i) =>
              r.band ? <path key={`b${i}`} d={r.band} fill="url(#sw-tl-band)" /> : null
            )}
            {geom.lineRuns.map((r, i) => (
              <path
                key={`l${i}`}
                d={r.path}
                fill="none"
                stroke={`url(#sw-tl-line-${i})`}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}

            {geom.ticks.map((i) => (
              <g key={`t${i}`}>
                <line
                  x1={geom.x(i)}
                  x2={geom.x(i)}
                  y1={H - PAD_B}
                  y2={H - PAD_B + 3.5}
                  style={{ stroke: "var(--sw-silver)", strokeOpacity: 0.9 }}
                  strokeWidth={1}
                />
                <text
                  x={geom.x(i)}
                  y={H - 6}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[8.5px] tabular-nums"
                >
                  {fmtTick.format(points[i].t)}
                </text>
              </g>
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
            — <MetricMention metric={metric} onHover={onMetricRefHover} /> · {tr.charts.timelineBand}
          </span>
        )}
      </div>
    </div>
  );
}
