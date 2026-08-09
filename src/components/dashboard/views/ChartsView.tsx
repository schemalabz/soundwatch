"use client";

// The charts view: the filtered time-set summarized four ways — timeline,
// 24-hour clock, week rose, month wheel. Everything answers to the rail:
// filtered-out sectors mute, and a chart whose question the current filters
// make unanswerable (the month wheel inside a 24-hour period) says why
// instead of drawing something meaningless.

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { dashboardStrings as tr, LOCALE } from "@/lib/strings/dashboard";
import {
  dowSelectionMask,
  hourSelectionMask,
  monthSelectionMask,
  type DashboardFilters,
} from "@/lib/dashboard/filters";
import { athensWallTime, ATHENS_TZ } from "@/lib/dashboard/time";
import type { AggKey } from "@/lib/dashboard/metrics";
import MetricMention from "../MetricMention";
import RadialChart, { type RadialSlice } from "../charts/RadialChart";
import TimelineChart from "../charts/TimelineChart";
import type { SeriesBucketData, SeriesResponse } from "../charts/types";

/** Mon-first display order over EXTRACT-style dow (0 = Sunday). */
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

function Section({ title, caption, children }: { title: string; caption?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[13px] font-semibold tracking-tight text-foreground">
        {title}
        {caption && <span className="ml-2 text-[10.5px] font-normal text-muted-foreground">{caption}</span>}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Unavailable({ reason }: { reason: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed px-6 py-4 text-center text-[11px] leading-relaxed text-muted-foreground">
      {reason}
    </div>
  );
}

function Skeleton({ round }: { round?: boolean }) {
  return (
    <div
      className={
        round
          ? "mx-auto size-48 animate-pulse rounded-full bg-silver/30"
          : "h-48 w-full animate-pulse rounded-lg bg-silver/30"
      }
    />
  );
}

function ChartsView({
  aggQuery,
  metric,
  filters,
  domainStartMs,
  nowMs,
  onMetricRefHover,
}: {
  /** from= + filter params, as built by filtersToAggregateQuery. */
  aggQuery: string;
  metric: AggKey;
  filters: DashboardFilters;
  domainStartMs: number;
  nowMs: number;
  onMetricRefHover?: (on: boolean) => void;
}) {
  // The response is tagged with the query that produced it — staleness (and
  // therefore "loading") is derived, never set synchronously in the effect.
  const [result, setResult] = useState<{ query: string; data: SeriesResponse } | null>(null);

  const domainDays = (nowMs - domainStartMs) / 86_400_000;
  const bucket: "hour" | "day" = domainDays <= 8 ? "hour" : "day";
  const query = `${aggQuery}&bucket=${bucket}`;
  const series = result?.query === query ? result.data : null;
  const loading = series == null;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/series?${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body: SeriesResponse) => {
        if (!cancelled) setResult({ query, data: body });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [query]);

  const hourMask = useMemo(() => hourSelectionMask(filters), [filters]);
  const dowMask = useMemo(() => dowSelectionMask(filters), [filters]);
  const monthMask = useMemo(() => monthSelectionMask(filters), [filters]);

  const dowFmt = useMemo(() => new Intl.DateTimeFormat(LOCALE, { timeZone: ATHENS_TZ, weekday: "short" }), []);
  const monthFmt = useMemo(() => new Intl.DateTimeFormat(LOCALE, { timeZone: ATHENS_TZ, month: "short" }), []);
  const dowLabels = useMemo(
    // 2026-02-01 is a Sunday; +d days walks Sun..Sat.
    () => Array.from({ length: 7 }, (_, d) => dowFmt.format(Date.UTC(2026, 1, 1 + d, 12))),
    [dowFmt]
  );
  const monthLabels = useMemo(
    () => Array.from({ length: 12 }, (_, m) => monthFmt.format(Date.UTC(2026, m, 15))),
    [monthFmt]
  );

  // Which calendar months the domain actually visits (Athens wall time).
  const monthsInDomain = useMemo(() => {
    const present = new Set<number>();
    for (let t = domainStartMs; t < nowMs; t += 86_400_000) present.add(athensWallTime(t).month);
    present.add(athensWallTime(nowMs).month);
    return present;
  }, [domainStartMs, nowMs]);

  const val = useCallback((b: SeriesBucketData | undefined): number | null => (b ? b[metric] : null), [metric]);

  const clockSlices: RadialSlice[] = useMemo(
    () =>
      Array.from({ length: 24 }, (_, h) => ({
        label: String(h).padStart(2, "0"),
        readout: `${String(h).padStart(2, "0")}:00–${String((h + 1) % 24).padStart(2, "0")}:00`,
        value: val(series?.hours[h]),
        n: series?.hours[h]?.n ?? 0,
        muted: !hourMask[h],
        showLabel: h % 6 === 0,
      })),
    [series, hourMask, val]
  );

  const dowSlices: RadialSlice[] = useMemo(
    () =>
      DOW_ORDER.map((d) => ({
        label: dowLabels[d],
        value: val(series?.dows[d]),
        n: series?.dows[d]?.n ?? 0,
        muted: !dowMask[d],
        showLabel: true,
      })),
    [series, dowMask, dowLabels, val]
  );

  const monthSlices: RadialSlice[] = useMemo(
    () =>
      Array.from({ length: 12 }, (_, m) => ({
        label: monthLabels[m],
        value: val(series?.months[m + 1]),
        n: series?.months[m + 1]?.n ?? 0,
        muted: !monthMask[m] || !monthsInDomain.has(m),
        showLabel: true,
      })),
    [series, monthMask, monthLabels, monthsInDomain, val]
  );

  // Viability: a chart must be able to CONTRAST something.
  const dowViable = domainDays >= 2;
  const selectedMonthsInDomain = [...monthsInDomain].filter((m) => monthMask[m]);
  const monthsViable = selectedMonthsInDomain.length >= 2;

  const metricLabel = tr.aggregations[metric].label.toLowerCase();

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-background">
      <div className="mx-auto max-w-4xl px-6 pb-16 pt-[4.5rem] md:px-10">
        <div className="flex flex-col gap-10">
          <Section title={tr.charts.timeline} caption={<MetricMention metric={metric} onHover={onMetricRefHover} />}>
            {loading || !series ? (
              <Skeleton />
            ) : (
              <TimelineChart points={series.timeline} metric={metric} bucket={series.bucket} onMetricRefHover={onMetricRefHover} />
            )}
          </Section>

          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
            <Section title={tr.charts.clock} caption={tr.charts.clockCaption}>
              {loading || !series ? (
                <Skeleton round />
              ) : (
                <RadialChart slices={clockSlices} caption={`${tr.charts.loudest} · ${metricLabel}`} />
              )}
            </Section>

            <Section title={tr.charts.dows} caption={tr.charts.dowsCaption}>
              {!dowViable ? (
                <Unavailable reason={tr.charts.needsDays} />
              ) : loading || !series ? (
                <Skeleton round />
              ) : (
                <RadialChart slices={dowSlices} caption={`${tr.charts.loudest} · ${metricLabel}`} />
              )}
            </Section>

            <Section title={tr.charts.monthsTitle} caption={tr.charts.monthsCaption}>
              {!monthsViable ? (
                <Unavailable reason={tr.charts.needsMonths} />
              ) : loading || !series ? (
                <Skeleton round />
              ) : (
                <RadialChart slices={monthSlices} caption={`${tr.charts.loudest} · ${metricLabel}`} />
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

// Re-renders once a minute (nowMs is minute-quantized), not once a second.
export default memo(ChartsView);
