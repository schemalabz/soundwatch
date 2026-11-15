"use client";

// The week, hour by hour: seven rows (Monday first), twenty-four columns,
// each cell the level of that clock hour on that day of the week across the
// whole filtered period. It is the direct answer to «how loud is Saturday
// night», and the one chart where a pattern in two dimensions shows at once.
//
// Every cell comes from /api/series' dowHours: the period's bins summed per
// (day of week, hour) on the server, so a percentile here is a percentile of
// that hour's readings, never an average of percentiles.
//
// Colour is heat.ts' ramp stretched over a scale the CALLER supplies, so
// several grids side by side (the comparison) can share one and stay
// comparable. Cells the filters exclude are hatched, never coloured.

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { fmtDb, fmtInt } from "@/lib/dashboard/format";
import { dowHourKey, heatColor, type HeatScale } from "@/lib/dashboard/heat";
import { dashboardStrings as tr, LOCALE } from "@/lib/strings/dashboard";
import type { AggKey } from "@/lib/dashboard/metrics";
import type { SeriesBucketData } from "@/lib/api/dashboard";

/** Mon-first display order over EXTRACT-style dow (0 = Sunday). */
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

// 2026-02-01 is a Sunday; +d days walks Sun..Sat.
const shortFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", weekday: "short" });
const longFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", weekday: "long" });
const DOW_SHORT = Array.from({ length: 7 }, (_, d) => shortFmt.format(Date.UTC(2026, 1, 1 + d, 12)));
const DOW_LONG = Array.from({ length: 7 }, (_, d) => longFmt.format(Date.UTC(2026, 1, 1 + d, 12)));

const hh = (h: number) => String(h % 24).padStart(2, "0");

export interface WeekCell {
  dow: number;
  hour: number;
  value: number;
  n: number;
}

/** «Σάββατο 22:00–23:00» */
export function weekCellLabel(dow: number, hour: number): string {
  return `${DOW_LONG[dow]} ${hh(hour)}:00–${hh(hour + 1)}:00`;
}

/** The loudest and quietest cells the masks admit; null when none has data. */
export function weekExtremes(
  cells: Record<number, SeriesBucketData>,
  metric: AggKey,
  hourMask?: boolean[],
  dowMask?: boolean[]
): { loudest: WeekCell; quietest: WeekCell } | null {
  let loudest: WeekCell | null = null;
  let quietest: WeekCell | null = null;
  for (const dow of DOW_ORDER) {
    if (dowMask && !dowMask[dow]) continue;
    for (const hour of HOURS) {
      if (hourMask && !hourMask[hour]) continue;
      const b = cells[dowHourKey(dow, hour)];
      if (!b || b.n === 0) continue;
      const cell = { dow, hour, value: b[metric], n: b.n };
      if (!loudest || cell.value > loudest.value) loudest = cell;
      if (!quietest || cell.value < quietest.value) quietest = cell;
    }
  }
  return loudest && quietest ? { loudest, quietest } : null;
}

export default function WeekHeatmap({
  cells,
  metric,
  scale,
  hourMask,
  dowMask,
  mini,
  onHover,
}: {
  /** Keyed dow * 24 + hour, as /api/series serves it. */
  cells: Record<number, SeriesBucketData>;
  metric: AggKey;
  /** The colour range; null draws every cell empty. */
  scale: HeatScale | null;
  /** Hours / days of week the filters admit; absent = all. */
  hourMask?: boolean[];
  dowMask?: boolean[];
  /** The small-multiple form: thin rows, no hour axis, initials for days. */
  mini?: boolean;
  /** The cell under the pointer (null on leave), for a readout the parent owns. */
  onHover?: (cell: WeekCell | null) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const rows = useMemo(
    () =>
      DOW_ORDER.map((dow) => ({
        dow,
        cells: HOURS.map((hour) => {
          const b = cells[dowHourKey(dow, hour)];
          const muted = (hourMask && !hourMask[hour]) || (dowMask && !dowMask[dow]);
          return { hour, muted, value: b && b.n > 0 ? b[metric] : null, n: b?.n ?? 0 };
        }),
      })),
    [cells, metric, hourMask, dowMask]
  );

  return (
    <div
      role="img"
      aria-label={tr.heat.title}
      className="w-full select-none"
      // A finger that lifts keeps its cell read out; a mouse that leaves clears it.
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        setHovered(null);
        onHover?.(null);
      }}
    >
      {!mini && (
        <div className="mb-1 grid grid-cols-[2.25rem_repeat(24,minmax(0,1fr))] text-[9.5px] tabular-nums text-muted-foreground">
          <span />
          {HOURS.map((h) => (
            // Labels sit on the cell's LEFT edge: 06 marks where 06:00 starts.
            <span key={h} className="-ml-1.5">
              {h % 3 === 0 ? hh(h) : ""}
            </span>
          ))}
        </div>
      )}
      <div className={cn("flex flex-col", mini ? "gap-px" : "gap-0.5")}>
        {rows.map((row) => (
          <div
            key={row.dow}
            className={cn("grid items-center", mini ? "grid-cols-[1.25rem_repeat(24,minmax(0,1fr))] gap-px" : "grid-cols-[2.25rem_repeat(24,minmax(0,1fr))] gap-0.5")}
          >
            <span className={cn("text-muted-foreground", mini ? "text-[8px] leading-[10px]" : "text-[10.5px]")}>
              {/* Two letters: one cannot tell Τρίτη from Τετάρτη, or Πέμπτη from Παρασκευή. */}
              {mini ? DOW_SHORT[row.dow].slice(0, 2) : DOW_SHORT[row.dow]}
            </span>
            {row.cells.map((c) => {
              const key = dowHourKey(row.dow, c.hour);
              const has = !c.muted && c.value != null && scale != null;
              return (
                <span
                  key={c.hour}
                  title={has ? `${weekCellLabel(row.dow, c.hour)} · ${fmtDb(c.value!)} dB · ${tr.board.measurements(fmtInt(c.n))}` : undefined}
                  onPointerEnter={() => {
                    setHovered(key);
                    onHover?.(has ? { dow: row.dow, hour: c.hour, value: c.value!, n: c.n } : null);
                  }}
                  className={cn(
                    mini ? "h-[10px] rounded-[1px]" : "h-[22px] rounded-[2px] md:h-[26px]",
                    !has && (c.muted ? "sw-heat-muted" : "bg-silver/15"),
                    hovered === key && has && "outline outline-[1.5px] outline-offset-[-0.5px] outline-foreground"
                  )}
                  style={has ? { backgroundColor: heatColor(c.value!, scale!) } : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
