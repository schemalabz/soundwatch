"use client";

// The leaderboard: every public sensor ranked by the rail-selected metric
// over the filtered time-set. The bar is the story — scaled between the
// quietest and loudest of the list, colored by the same level ramp as the
// map circles, so the two views read as one system.

import { memo, useMemo } from "react";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";
import { levelColor, paletteStops } from "@/lib/dashboard/levels";
import { fmtDb, fmtInt } from "@/lib/dashboard/format";
import type { AggKey } from "@/lib/dashboard/metrics";
import type { SensorMeta } from "../SensorLayer";
import MetricMention from "../MetricMention";

function Leaderboard({
  aggData,
  metric,
  sensors,
  onSensorClick,
  onMetricRefHover,
}: {
  aggData: Record<string, Record<AggKey, number> & { n: number }> | null;
  metric: AggKey;
  sensors: SensorMeta[];
  onSensorClick: (id: string) => void;
  onMetricRefHover?: (on: boolean) => void;
}) {
  const meta = useMemo(() => new Map(sensors.map((s) => [s.id, s])), [sensors]);
  const stops = useMemo(() => paletteStops(), []);

  const rows = useMemo(() => {
    if (!aggData) return null;
    return Object.entries(aggData)
      .map(([id, v]) => ({ id, value: v[metric], n: v.n }))
      .sort((a, b) => b.value - a.value);
  }, [aggData, metric]);

  const [lo, hi] = useMemo(() => {
    if (!rows || rows.length === 0) return [0, 1];
    return [rows[rows.length - 1].value, rows[0].value];
  }, [rows]);

  const barFraction = (v: number) => (hi === lo ? 1 : 0.06 + 0.94 * ((v - lo) / (hi - lo)));

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-background">
      <div className="mx-auto max-w-2xl px-6 pb-16 pt-[4.5rem] md:px-8">
        <h2 className="text-[15px] font-semibold tracking-tight">{tr.board.title}</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {tr.board.subtitlePrefix}
          <MetricMention metric={metric} onHover={onMetricRefHover} />
          {tr.board.subtitleSuffix}
        </p>

        {rows == null ? (
          <div className="mt-6 flex flex-col gap-2">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-md bg-silver/30" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-8 text-center text-[12px] text-muted-foreground">{tr.board.empty}</p>
        ) : (
          <ol className="mt-5">
            {rows.map((row, i) => {
              const m = meta.get(row.id);
              const color = levelColor(row.value, stops);
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => onSensorClick(row.id)}
                    className="group grid w-full grid-cols-[2rem_minmax(7rem,11rem)_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-silver/20"
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
      </div>
    </div>
  );
}

// Re-renders only when aggregate data / metric / fleet change.
export default memo(Leaderboard);
