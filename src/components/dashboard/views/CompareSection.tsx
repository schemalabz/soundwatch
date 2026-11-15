"use client";

// The comparison: up to four places from the ranking, side by side over the
// same filtered period. Two readings of the same data:
//
// - the typical day, one line per place (and the whole network, dashed, to
//   hold them against), which shows WHEN they differ;
// - each place's week, hour by hour, as small grids on ONE colour scale, so
//   a darker cell is a louder hour whichever grid it is in.
//
// Each place is one /api/series request scoped to that sensor and carrying
// the rail's filters, so everything here answers to the same period, days
// and hours as the ranking above it. Responses are kept by the query that
// produced them: a filter change makes them stale by derivation.

import { memo, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";
import { COMPARE_COLORS, MAX_COMPARE } from "@/lib/dashboard/compare";
import { dowSelectionMask, hourSelectionMask, type DashboardFilters } from "@/lib/dashboard/filters";
import { fmtDb } from "@/lib/dashboard/format";
import { heatGradient, heatScale } from "@/lib/dashboard/heat";
import type { AggKey } from "@/lib/dashboard/metrics";
import type { SeriesResponse } from "@/lib/api/dashboard";
import { fetchHourlySeries, hourStableQuery } from "@/lib/dashboard/seriesCache";
import MetricMention from "../MetricMention";
import ScopeChip from "../ScopeChip";
import ProfileChart, { type ProfileLine } from "../charts/ProfileChart";
import WeekHeatmap from "../charts/WeekHeatmap";
import type { SensorMeta } from "../SensorLayer";
import { devRenderCount } from "@/lib/dashboard/devtools";

/** The whole network's series: the reference every place is held against. */
const NETWORK = "all";

function CompareSection({
  ids,
  sensors,
  aggQuery,
  metric,
  filters,
  scope,
  onRemove,
  onClear,
  onMetricRefHover,
}: {
  /** The places being compared, in the order they were added (≤ MAX_COMPARE). */
  ids: readonly string[];
  sensors: SensorMeta[];
  /** from= + filter params, as built by filtersToAggregateQuery. */
  aggQuery: string;
  metric: AggKey;
  filters: DashboardFilters;
  /** What the comparison covers, in the rail's words. */
  scope: string;
  onRemove: (id: string) => void;
  onClear: () => void;
  onMetricRefHover?: (on: boolean) => void;
}) {
  devRenderCount("CompareSection");
  const [loaded, setLoaded] = useState<Record<string, SeriesResponse>>({});

  // Floored to the hour: a trailing period moves from= every minute, and an
  // hourly series cannot change with it (see seriesCache).
  const query = useMemo(() => hourStableQuery(aggQuery), [aggQuery]);
  const keyFor = (id: string) => `${query}|${id}`;
  const wanted = ids.length > 0 ? [NETWORK, ...ids].join(",") : "";

  // Keyed on what is WANTED, not on what is still missing: keyed on the
  // latter, every answer that arrived re-ran this, cancelled the requests
  // still in flight and sent them again. A place already answered costs
  // nothing to ask for again; the cache holds its request.
  useEffect(() => {
    if (wanted === "") return;
    let cancelled = false;
    for (const id of wanted.split(",")) {
      fetchHourlySeries(query, id === NETWORK ? undefined : id)
        .then((body) => {
          if (cancelled) return;
          // Only the current query's answers are kept: a filter change starts over.
          setLoaded((prev) => {
            const next: Record<string, SeriesResponse> = {};
            for (const [k, v] of Object.entries(prev)) if (k.startsWith(`${query}|`)) next[k] = v;
            next[`${query}|${id}`] = body;
            return next;
          });
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [query, wanted]);

  const names = useMemo(() => new Map(sensors.map((s) => [s.id, s.name ?? s.address ?? s.id.slice(0, 8)])), [sensors]);
  const hourMask = useMemo(() => hourSelectionMask(filters), [filters]);
  const dowMask = useMemo(() => dowSelectionMask(filters), [filters]);

  const places = ids.map((id, i) => ({
    id,
    name: names.get(id) ?? id.slice(0, 8),
    color: COMPARE_COLORS[i % COMPARE_COLORS.length],
    series: loaded[keyFor(id)] ?? null,
  }));
  const network = loaded[keyFor(NETWORK)] ?? null;

  const lines: ProfileLine[] = [
    ...(network
      ? [
          {
            id: "network",
            label: tr.compare.network,
            color: "color-mix(in srgb, var(--sw-slate) 55%, transparent)",
            reference: true,
            values: Array.from({ length: 24 }, (_, h) => (hourMask[h] && network.hours[h] ? network.hours[h][metric] : null)),
          },
        ]
      : []),
    ...places
      .filter((p) => p.series)
      .map((p) => ({
        id: p.id,
        label: p.name,
        color: p.color,
        values: Array.from({ length: 24 }, (_, h) => (hourMask[h] && p.series!.hours[h] ? p.series!.hours[h][metric] : null)),
      })),
  ];

  // One scale for every grid: the same colour is the same level in each.
  const scale = heatScale(
    places.flatMap((p) =>
      p.series
        ? Object.entries(p.series.dowHours)
            .filter(([k]) => hourMask[Number(k) % 24] && dowMask[Math.floor(Number(k) / 24)])
            .map(([, b]) => (b.n > 0 ? b[metric] : null))
        : []
    )
  );

  return (
    <div className="mx-auto max-w-4xl px-6 md:px-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-semibold tracking-tight">{tr.compare.title}</h2>
        {ids.length > 0 && (
          <button type="button" onClick={onClear} className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            {tr.compare.clear}
          </button>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {ids.length === 0 ? (
          tr.compare.subtitleEmpty
        ) : (
          <>
            <MetricMention metric={metric} onHover={onMetricRefHover} /> · <ScopeChip fallback={scope} />
          </>
        )}
      </p>

      {ids.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-dashed px-4 py-4 text-[12px] leading-snug text-muted-foreground">
          <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-card text-foreground">
            <Plus className="size-3.5" />
          </span>
          {tr.compare.empty(MAX_COMPARE)}
        </div>
      ) : (
        <>
          {/* the places, as the chart's key */}
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {places.map((p) => (
              <li key={p.id} className="inline-flex items-center gap-1.5 rounded-full border bg-card py-1 pl-2.5 pr-1 text-[12px] font-medium">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="max-w-[11rem] truncate">{p.name}</span>
                <button
                  type="button"
                  onClick={() => onRemove(p.id)}
                  aria-label={tr.compare.remove(p.name)}
                  className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground max-md:size-8"
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
            <li className="inline-flex items-center gap-1.5 px-1.5 text-[11px] text-muted-foreground">
              <span className="w-4 border-t border-dashed border-slate/60" />
              {tr.compare.network}
            </li>
          </ul>

          <h3 className="mt-5 text-[12px] font-semibold tracking-tight text-foreground">
            {tr.compare.dayTitle}
            <span className="ml-2 text-[10.5px] font-normal text-muted-foreground">{tr.compare.dayCaption}</span>
          </h3>
          <div className="mt-2">
            {lines.length === 0 ? (
              <div className="h-[190px] animate-pulse rounded-lg bg-silver/30" />
            ) : (
              <ProfileChart lines={lines} hourMask={hourMask} idleHint={tr.compare.dayHint} />
            )}
          </div>

          <h3 className="mt-6 text-[12px] font-semibold tracking-tight text-foreground">
            {tr.compare.weekTitle}
            <span className="ml-2 text-[10.5px] font-normal text-muted-foreground">{tr.compare.weekCaption}</span>
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-4 lg:grid-cols-4">
            {places.map((p) => (
              <div key={p.id} className="min-w-0">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-medium">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="truncate">{p.name}</span>
                </div>
                {p.series ? (
                  <WeekHeatmap mini cells={p.series.dowHours} metric={metric} scale={scale} hourMask={hourMask} dowMask={dowMask} />
                ) : (
                  <div className="h-[76px] animate-pulse rounded bg-silver/30" />
                )}
              </div>
            ))}
          </div>
          {scale && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] tabular-nums text-muted-foreground">
              <span>{fmtDb(scale.lo)}</span>
              <span className="h-1.5 w-28 shrink-0 rounded-full" style={{ background: heatGradient() }} />
              <span className="whitespace-nowrap">{fmtDb(scale.hi)} dB</span>
              <span className="max-md:basis-full md:ml-1">{tr.compare.sharedScale}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default memo(CompareSection);
