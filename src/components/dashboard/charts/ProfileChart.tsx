"use client";

// The typical day, one line per place: the level of each clock hour over the
// filtered period, drawn through the hour centres. Used by the comparison,
// where the question is «when do these places differ», so the y axis fits
// the lines drawn rather than the full ramp.
//
// The readout under the chart is the hovered hour (idle: nothing), one value
// per line, in the line's colour. No floating tooltip over the geometry.

import { useMemo, useState, type PointerEvent } from "react";
import { fmtDb } from "@/lib/dashboard/format";
import { useMeasuredWidth } from "./useMeasuredWidth";

export interface ProfileLine {
  id: string;
  label: string;
  color: string;
  /** The reference line (the whole network): thinner, dashed. */
  reference?: boolean;
  /** Index = clock hour; null = no data that hour. */
  values: (number | null)[];
}

const DEFAULT_H = 190;
const PAD_L = 26;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 18;

const hh = (h: number) => String(h % 24).padStart(2, "0");

export default function ProfileChart({
  lines,
  hourMask,
  idleHint,
  height,
}: {
  lines: ProfileLine[];
  /** Hours the filters admit; excluded hours are shaded. */
  hourMask?: boolean[];
  /** Shown in the readout row while nothing is hovered. */
  idleHint: string;
  /** Chart height in px (defaults to the comparison's size). */
  height?: number;
}) {
  const H = height ?? DEFAULT_H;
  const [ref, width] = useMeasuredWidth();
  const [hour, setHour] = useState<number | null>(null);

  const geom = useMemo(() => {
    if (width === 0) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (const l of lines)
      for (const v of l.values)
        if (v != null) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
    if (!Number.isFinite(lo)) return null;
    lo = Math.floor((lo - 1) / 5) * 5;
    hi = Math.ceil((hi + 1) / 5) * 5;
    const innerW = width - PAD_L - PAD_R;
    const innerH = H - PAD_T - PAD_B;
    const x = (h: number) => PAD_L + (h / 24) * innerW;
    const y = (v: number) => PAD_T + innerH * (1 - (v - lo) / (hi - lo));
    const paths = lines.map((l) => {
      const runs: string[] = [];
      let run: string[] = [];
      for (let h = 0; h < 24; h++) {
        const v = l.values[h];
        if (v == null) {
          if (run.length > 0) runs.push(`M${run.join(" L")}`);
          run = [];
          continue;
        }
        run.push(`${x(h + 0.5).toFixed(1)} ${y(v).toFixed(1)}`);
      }
      if (run.length > 0) runs.push(`M${run.join(" L")}`);
      return runs.join(" ");
    });
    const ticks: number[] = [];
    for (let v = lo; v <= hi; v += 5) ticks.push(v);
    return { x, y, paths, ticks, innerW };
  }, [width, lines, H]);

  const readHour = (e: PointerEvent<SVGSVGElement>) => {
    if (!geom) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const h = Math.floor(((e.clientX - rect.left - PAD_L) / geom.innerW) * 24);
    setHour(h >= 0 && h < 24 ? h : null);
  };

  return (
    <div ref={ref} className="w-full">
      {geom && (
        <svg
          width={width}
          height={H}
          role="img"
          className="block overflow-visible"
          // Pointer events, so a tap or a sideways drag of a finger reads the
          // chart like a mouse does. A finger that lifts keeps its readout
          // (there is no hover to come back to); a mouse that leaves clears it.
          style={{ touchAction: "pan-y" }}
          onPointerDown={readHour}
          onPointerMove={readHour}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setHour(null);
          }}
        >
          {hourMask?.map((on, h) =>
            on ? null : (
              <rect key={h} x={geom.x(h)} width={geom.x(h + 1) - geom.x(h)} y={PAD_T} height={H - PAD_T - PAD_B} fill="var(--sw-silver)" opacity={0.14} />
            )
          )}
          {geom.ticks.map((v) => (
            <g key={v}>
              <line x1={PAD_L} x2={width - PAD_R} y1={geom.y(v)} y2={geom.y(v)} stroke="var(--border)" strokeWidth={0.6} />
              <text x={PAD_L - 5} y={geom.y(v) + 3} textAnchor="end" fontSize={9} fill="var(--muted-foreground)" className="tabular-nums">
                {v}
              </text>
            </g>
          ))}
          {hour != null && (
            <rect x={geom.x(hour)} width={geom.x(hour + 1) - geom.x(hour)} y={PAD_T} height={H - PAD_T - PAD_B} fill="var(--sw-ink)" opacity={0.06} />
          )}
          {lines.map((l, i) => (
            <path
              key={l.id}
              d={geom.paths[i]}
              fill="none"
              stroke={l.color}
              strokeWidth={l.reference ? 1.2 : 2}
              strokeDasharray={l.reference ? "4 3" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {hour != null &&
            lines.map((l) => {
              const v = l.values[hour];
              return v == null || l.reference ? null : (
                <circle key={l.id} cx={geom.x(hour + 0.5)} cy={geom.y(v)} r={3.2} fill={l.color} stroke="var(--sw-paper)" strokeWidth={1.2} />
              );
            })}
          {[0, 6, 12, 18, 24].map((h) => (
            <text
              key={h}
              x={geom.x(h)}
              y={H - 4}
              textAnchor={h === 0 ? "start" : h === 24 ? "end" : "middle"}
              fontSize={9}
              fill="var(--muted-foreground)"
              className="tabular-nums"
            >
              {hh(h)}
            </text>
          ))}
        </svg>
      )}
      <div className="mt-1 flex min-h-[1.25rem] flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px] tabular-nums">
        {hour == null ? (
          <span className="text-muted-foreground">{idleHint}</span>
        ) : (
          <>
            <span className="font-semibold text-foreground">
              {hh(hour)}:00–{hh(hour + 1)}:00
            </span>
            {lines.map((l) => {
              const v = l.values[hour];
              return (
                <span key={l.id} className="inline-flex items-baseline gap-1">
                  <span className="inline-block size-2 self-center rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="max-w-[9rem] truncate text-muted-foreground">{l.label}</span>
                  <span className="font-semibold text-foreground">{v == null ? "—" : fmtDb(v)}</span>
                </span>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
