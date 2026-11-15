"use client";

// One place over the period, opened inside its row of the ranking.
//
// On the period lens a place used to open the map's pane, which shows the
// level of the last ten minutes and today against the usual: a moment,
// floating over a view about a period, and covering the ranking's numbers
// while it did. This is the period's answer instead, in the same words and
// filters as everything around it: where the place ranks, its typical day
// against the whole network, and its week hour by hour. The moment is one
// button away («Δες την τώρα στον χάρτη»).

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Check, MapPin, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";
import { dowSelectionMask, hourSelectionMask, type DashboardFilters } from "@/lib/dashboard/filters";
import { fmtDb } from "@/lib/dashboard/format";
import { heatGradient, heatScale } from "@/lib/dashboard/heat";
import { fetchHourlySeries, hourStableQuery } from "@/lib/dashboard/seriesCache";
import type { AggKey } from "@/lib/dashboard/metrics";
import type { SeriesResponse } from "@/lib/api/dashboard";
import ProfileChart, { type ProfileLine } from "../charts/ProfileChart";
import WeekHeatmap, { weekCellLabel, weekExtremes } from "../charts/WeekHeatmap";

function PlaceDetail({
  sensorId,
  name,
  address,
  rank,
  total,
  aggQuery,
  metric,
  filters,
  inCompare,
  compareFull,
  onCompareToggle,
  onGoToMap,
}: {
  sensorId: string;
  name: string;
  address: string | null;
  /** 1-based position in the ranking, out of `total`. */
  rank: number;
  total: number;
  /** from= + filter params, as built by filtersToAggregateQuery. */
  aggQuery: string;
  metric: AggKey;
  filters: DashboardFilters;
  inCompare: boolean;
  compareFull: boolean;
  onCompareToggle?: () => void;
  onGoToMap?: () => void;
}) {
  // Floored to the hour: a trailing period moves from= every minute, and an
  // hourly series cannot change with it (see seriesCache).
  const query = useMemo(() => hourStableQuery(aggQuery), [aggQuery]);
  // Tagged with the request that produced it: another place or other filters
  // make it stale by derivation.
  const [loaded, setLoaded] = useState<{ query: string; sensorId: string; place: SeriesResponse; network: SeriesResponse } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchHourlySeries(query, sensorId), fetchHourlySeries(query)])
      .then(([place, network]) => {
        if (!cancelled) setLoaded({ query, sensorId, place, network });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [query, sensorId]);

  // The same place under other filters keeps its charts, dimmed, until the
  // new ones land: back to skeletons, the card would shrink and grow and
  // push everything under it around.
  const data = loaded?.sensorId === sensorId ? loaded : null;
  const stale = data != null && data.query !== query;
  // Opened from a circle on the map, the row is scrolled to before its
  // charts have arrived and grown it: once they have, bring all of it in.
  // Once per opening: `ready` stays true through later filter changes.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const ready = data != null;
  useEffect(() => {
    if (ready) rootRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [ready]);
  const hourMask = useMemo(() => hourSelectionMask(filters), [filters]);
  const dowMask = useMemo(() => dowSelectionMask(filters), [filters]);

  const lines: ProfileLine[] = data
    ? [
        {
          id: "network",
          label: tr.compare.network,
          color: "color-mix(in srgb, var(--sw-slate) 55%, transparent)",
          reference: true,
          values: Array.from({ length: 24 }, (_, h) => (hourMask[h] && data.network.hours[h] ? data.network.hours[h][metric] : null)),
        },
        {
          id: sensorId,
          label: name,
          color: "var(--sw-ink)",
          values: Array.from({ length: 24 }, (_, h) => (hourMask[h] && data.place.hours[h] ? data.place.hours[h][metric] : null)),
        },
      ]
    : [];
  const extremes = data ? weekExtremes(data.place.dowHours, metric, hourMask, dowMask) : null;
  const scale = extremes ? heatScale([extremes.loudest.value, extremes.quietest.value]) : null;

  return (
    <div ref={rootRef} className="scroll-mb-6 px-4 pb-4 pt-3.5">
      <p className="text-[11.5px] text-muted-foreground">
        <span className="font-semibold text-foreground">{tr.place.rank(rank, total)}</span>
        {address && address !== name && <> · {address}</>}
      </p>

      <div className={cn("mt-3 grid grid-cols-1 gap-x-6 gap-y-4 transition-opacity duration-200 sm:grid-cols-2", stale && "opacity-45")} aria-busy={stale || undefined}>
        <div className="min-w-0">
          <h3 className="text-[11.5px] font-semibold tracking-tight text-foreground">{tr.place.dayTitle}</h3>
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="w-4 border-t border-dashed border-slate/60" />
            {tr.compare.network}
          </p>
          {data ? (
            lines.some((l) => !l.reference && l.values.some((v) => v != null)) ? (
              <ProfileChart lines={lines} hourMask={hourMask} idleHint={tr.place.dayHint} height={132} />
            ) : (
              <p className="py-6 text-center text-[11px] text-muted-foreground">{tr.charts.noData}</p>
            )
          ) : (
            <div className="h-[132px] animate-pulse rounded-md bg-silver/30" />
          )}
        </div>

        <div className="min-w-0">
          <h3 className="text-[11.5px] font-semibold tracking-tight text-foreground">{tr.place.weekTitle}</h3>
          <p className="mb-1.5 text-[10px] text-muted-foreground">{tr.compare.weekCaption}</p>
          {data ? (
            <>
              <WeekHeatmap mini cells={data.place.dowHours} metric={metric} scale={scale} hourMask={hourMask} dowMask={dowMask} />
              {scale && extremes && (
                <>
                  <div className="mt-2 flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
                    <span>{fmtDb(scale.lo)}</span>
                    <span className="h-1.5 w-24 shrink-0 rounded-full" style={{ background: heatGradient() }} />
                    <span className="whitespace-nowrap">{fmtDb(scale.hi)} dB</span>
                  </div>
                  <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                    {tr.heat.loudest}:{" "}
                    <span className="font-semibold text-foreground">
                      {weekCellLabel(extremes.loudest.dow, extremes.loudest.hour)} · <span className="whitespace-nowrap">{fmtDb(extremes.loudest.value)} dB</span>
                    </span>
                    <br />
                    {tr.place.quietest}: {weekCellLabel(extremes.quietest.dow, extremes.quietest.hour)} · <span className="whitespace-nowrap">{fmtDb(extremes.quietest.value)} dB</span>
                  </p>
                </>
              )}
            </>
          ) : (
            <div className="h-[76px] animate-pulse rounded bg-silver/30" />
          )}
        </div>
      </div>

      {/* One line, also on a phone: the two share the width there. */}
      <div className="mt-3.5 flex gap-2 border-t pt-3">
        {onGoToMap && (
          <button
            type="button"
            onClick={onGoToMap}
            className="inline-flex min-h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-secondary max-sm:flex-1 max-md:min-h-10"
          >
            <MapPin className="size-3.5" />
            {tr.place.goToMoment}
          </button>
        )}
        {onCompareToggle && (
          <button
            type="button"
            aria-pressed={inCompare}
            disabled={!inCompare && compareFull}
            onClick={onCompareToggle}
            className={cn(
              "inline-flex min-h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[12px] font-medium transition-colors max-sm:flex-1 max-md:min-h-10",
              inCompare ? "border-transparent bg-foreground text-background" : "text-foreground hover:bg-secondary",
              !inCompare && compareFull && "pointer-events-none opacity-40"
            )}
          >
            {inCompare ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
            {inCompare ? tr.place.inCompare : tr.place.addToCompare}
          </button>
        )}
      </div>
    </div>
  );
}

export default memo(PlaceDetail);
