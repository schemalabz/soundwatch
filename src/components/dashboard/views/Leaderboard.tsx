"use client";

// The leaderboard: every public sensor ranked by the rail-selected metric
// over the filtered time-set. The bar is the story, colored by the same level
// ramp as the map circles, so the two views read as one system.
//
// The bar's scale is FIXED per metric, not stretched between the list's own
// quietest and loudest: stretched, a filter that lowers every place by 5 dB
// (nights) redrew exactly the same bars, and the filters looked broken.

import { memo, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";
import { levelColor, paletteStops } from "@/lib/dashboard/levels";
import { fmtDb, fmtInt } from "@/lib/dashboard/format";
import type { AggKey } from "@/lib/dashboard/metrics";
import type { SensorMeta } from "../SensorLayer";
import MetricMention from "../MetricMention";
import { devRenderCount } from "@/lib/dashboard/devtools";

/** The ranking opens on its head; the rest is one tap away. */
const TOP_N = 5;

/** Device-dB the bar spans, per metric: Lmax is one frame's peak and sits
 *  far above the others. Arbitrary visual anchors, like the map's ramp. */
const BAR_SCALE: Record<AggKey, [number, number]> = {
  laeq: [40, 85],
  l50: [40, 85],
  l10: [40, 85],
  l90: [40, 85],
  lmax: [70, 120],
};

function Leaderboard({
  aggData,
  metric,
  sensors,
  onSensorClick,
  onMetricRefHover,
  embedded,
  stale,
  scope,
}: {
  aggData: Record<string, Record<AggKey, number> & { n: number }> | null;
  metric: AggKey;
  sensors: SensorMeta[];
  onSensorClick: (id: string) => void;
  onMetricRefHover?: (on: boolean) => void;
  /** Inside the summary's own scroll: no overlay, no top inset. */
  embedded?: boolean;
  /** The filters changed and their ranking is on its way. */
  stale?: boolean;
  /** What the ranking covers, in the rail's words: «τις νύχτες, μόνο ΣΚ». */
  scope?: string;
}) {
  devRenderCount("Leaderboard");
  const [expanded, setExpanded] = useState(false);
  const meta = useMemo(() => new Map(sensors.map((s) => [s.id, s])), [sensors]);
  const stops = useMemo(() => paletteStops(), []);

  const rows = useMemo(() => {
    if (!aggData) return null;
    return Object.entries(aggData)
      .map(([id, v]) => ({ id, value: v[metric], n: v.n }))
      .sort((a, b) => b.value - a.value);
  }, [aggData, metric]);

  const visibleRows = useMemo(() => {
    if (!rows) return [];
    return expanded ? rows : rows.slice(0, TOP_N);
  }, [rows, expanded]);
  const hiddenCount = rows ? Math.max(0, rows.length - TOP_N) : 0;
  const [lo, hi] = BAR_SCALE[metric];
  const barFraction = (v: number) => 0.04 + 0.96 * Math.min(1, Math.max(0, (v - lo) / (hi - lo)));

  return (
    <div className={embedded ? "" : "absolute inset-0 z-10 overflow-y-auto bg-background"}>
      <div className={embedded ? "mx-auto max-w-2xl px-6 pb-4 md:px-8" : "mx-auto max-w-2xl px-6 pb-16 pt-[4.5rem] md:px-8"}>
        <h2 className="text-[15px] font-semibold tracking-tight">{tr.board.title}</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {tr.board.subtitlePrefix}
          <MetricMention metric={metric} onHover={onMetricRefHover} />
          {scope && tr.board.subtitleScope(scope)}
        </p>

        {rows == null ? (
          <div className="mt-6 flex flex-col gap-2">
            {Array.from({ length: TOP_N }, (_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-md bg-silver/30" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-8 text-center text-[12px] text-muted-foreground">{tr.board.empty}</p>
        ) : (
          <ol className={cn("mt-5 transition-opacity duration-200", stale && "opacity-45")} aria-busy={stale || undefined}>
            {visibleRows.map((row, i) => {
              const m = meta.get(row.id);
              const color = levelColor(row.value, stops);
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => onSensorClick(row.id)}
                    className="group grid min-h-11 w-full grid-cols-[1.75rem_minmax(0,1fr)_4.5rem_auto] items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-silver/20 sm:grid-cols-[2rem_minmax(7rem,11rem)_1fr_auto]"
                  >
                    <span
                      className={
                        i < 3
                          ? "text-[15px] font-bold tabular-nums text-sound"
                          : "text-[12px] font-medium tabular-nums text-muted-foreground"
                      }
                    >
                      {i + 1}
                    </span>
                    <span className="truncate">
                      <span className="block truncate text-[12.5px] font-medium leading-tight text-foreground">
                        {m?.name ?? row.id.slice(0, 8)}
                      </span>
                      <span className="block truncate text-[9.5px] leading-tight text-muted-foreground">
                        {tr.board.measurements(fmtInt(row.n))}
                      </span>
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-silver/25">
                      <span
                        className="block h-full rounded-full transition-[width] duration-500"
                        style={{ width: `${barFraction(row.value) * 100}%`, backgroundColor: color }}
                      />
                    </span>
                    <span className="w-16 text-right">
                      <span className="text-[13.5px] font-semibold tabular-nums" style={{ color }}>
                        {fmtDb(row.value)}
                      </span>
                      <span className="ml-0.5 text-[9px] text-muted-foreground">dB</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {hiddenCount > 0 && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-dashed text-[12px] font-medium text-foreground/80 transition-colors hover:bg-silver/20 hover:text-foreground"
          >
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {expanded ? tr.board.showLess : tr.board.showAll(hiddenCount)}
          </button>
        )}
      </div>
    </div>
  );
}

// Re-renders only when aggregate data / metric / fleet change.
export default memo(Leaderboard);
