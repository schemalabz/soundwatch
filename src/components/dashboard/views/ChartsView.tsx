"use client";

// The charts view: the filtered time-set summarized five ways — timeline,
// the week hour by hour, 24-hour clock, week rose, month wheel. Everything answers to the rail:
// filtered-out sectors mute, and a chart whose question the current filters
// make unanswerable (the month wheel inside a 24-hour period) says why
// instead of drawing something meaningless.

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { dashboardStrings as tr, LOCALE } from "@/lib/strings/dashboard";
import { cn } from "@/lib/utils";
import {
  instantMatches,
  dowSelectionMask,
  hourSelectionMask,
  monthSelectionMask,
  type DashboardFilters,
} from "@/lib/dashboard/filters";
import { athensWallTime, ATHENS_TZ } from "@/lib/dashboard/time";
import type { AggKey } from "@/lib/dashboard/metrics";
import MetricMention from "../MetricMention";
import ScopeChip from "../ScopeChip";
import RadialChart, { type RadialSlice } from "../charts/RadialChart";
import TimelineChart from "../charts/TimelineChart";
import WeekHeatmap, { weekCellLabel, weekExtremes, type WeekCell } from "../charts/WeekHeatmap";
import { fmtDb, fmtInt } from "@/lib/dashboard/format";
import { heatGradient, heatScale } from "@/lib/dashboard/heat";
import type { SeriesBucketData, SeriesResponse } from "@/lib/api/dashboard";
import { BUCKETS, bucketViable, chartDefaultBucket } from "@/lib/dashboard/buckets";
import { devRenderCount } from "@/lib/dashboard/devtools";

// Slow enough not to hammer a raw-readings query, fast enough that a
// 1-minute chart visibly advances while you watch it.
const LIVE_REFRESH_MS = 30_000;

/** Mon-first display order over EXTRACT-style dow (0 = Sunday). */
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

function Section({
  title,
  caption,
  aside,
  scoped,
  children,
}: {
  title: string;
  /** Carries the selection chip: the chart is of exactly that selection. */
  scoped?: boolean;
  caption?: React.ReactNode;
  /** Controls that belong to this chart, right-aligned on the title row. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
        <h2 className="text-[13px] font-semibold tracking-tight text-foreground">
          {title}
          {caption && <span className="ml-2 text-[10.5px] font-normal text-muted-foreground">{caption}</span>}
          {scoped && (
            <span className="ml-2 text-[10.5px] font-normal">
              <ScopeChip />
            </span>
          )}
        </h2>
        {aside}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Resolution picker: unviable widths are shown disabled rather than hidden,
 *  so the ladder reads the same at every domain length. */
function BucketPicker({
  domainMs,
  active,
  onChange,
}: {
  domainMs: number;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={tr.charts.resolution}>
      {BUCKETS.map((b) => {
        const viable = bucketViable(domainMs, b.seconds);
        return (
          <button
            key={b.id}
            type="button"
            disabled={!viable}
            aria-pressed={b.id === active}
            title={viable ? b.label : tr.charts.resolutionUnavailable}
            onClick={() => onChange(b.id)}
            className={cn(
              // Phones: a 36 px target per step; the row wraps under the title.
              "rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums transition-colors max-md:min-h-9 max-md:min-w-9",
              b.id === active
                ? "bg-sound/15 text-foreground inset-ring inset-ring-sound/40"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              !viable && "pointer-events-none text-muted-foreground/30"
            )}
          >
            {b.id}
          </button>
        );
      })}
    </div>
  );
}

/** The network's week as a grid, with its readout and its own colour key. */
function WeekSection({
  cells,
  metric,
  hourMask,
  dowMask,
  filtered,
}: {
  cells: Record<number, SeriesBucketData>;
  metric: AggKey;
  hourMask: boolean[];
  dowMask: boolean[];
  /** Some cells are outside the filters: the key explains the hatching. */
  filtered: boolean;
}) {
  const [hovered, setHovered] = useState<WeekCell | null>(null);
  const extremes = useMemo(() => weekExtremes(cells, metric, hourMask, dowMask), [cells, metric, hourMask, dowMask]);
  const scale = useMemo(() => (extremes ? heatScale([extremes.loudest.value, extremes.quietest.value]) : null), [extremes]);
  if (!extremes || !scale) return <Unavailable reason={tr.charts.noData} />;
  return (
    <div>
      {/* the readout: the hovered hour, else the week's two ends */}
      <p className="mb-2 min-h-[1.1rem] text-[11.5px] tabular-nums text-muted-foreground">
        {hovered ? (
          <>
            <span className="font-semibold text-foreground">{weekCellLabel(hovered.dow, hovered.hour)}</span>
            {" · "}
            <span className="font-semibold text-foreground">{fmtDb(hovered.value)} dB</span>
            {" · "}
            {tr.board.measurements(fmtInt(hovered.n))}
          </>
        ) : (
          <>
            {tr.heat.loudest}:{" "}
            <span className="font-semibold text-foreground">
              {weekCellLabel(extremes.loudest.dow, extremes.loudest.hour)} · {fmtDb(extremes.loudest.value)} dB
            </span>
            {" · "}
            {tr.heat.quietest}: {weekCellLabel(extremes.quietest.dow, extremes.quietest.hour)} · {fmtDb(extremes.quietest.value)} dB
          </>
        )}
      </p>
      <WeekHeatmap cells={cells} metric={metric} scale={scale} hourMask={hourMask} dowMask={dowMask} onHover={setHovered} />
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] tabular-nums text-muted-foreground">
        <span>
          {tr.heat.quieter} {fmtDb(scale.lo)}
        </span>
        <span className="h-1.5 w-28 rounded-full" style={{ background: heatGradient() }} />
        <span>
          {fmtDb(scale.hi)} dB {tr.heat.louder}
        </span>
        {filtered && (
          <span className="ml-2 inline-flex items-center gap-1">
            <span className="sw-heat-muted inline-block h-2.5 w-4 rounded-[2px]" />
            {tr.heat.excluded}
          </span>
        )}
        <span className="basis-full text-muted-foreground/80">{tr.heat.relative}</span>
      </div>
    </div>
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
  embedded,
}: {
  /** from= + filter params, as built by filtersToAggregateQuery. */
  aggQuery: string;
  metric: AggKey;
  filters: DashboardFilters;
  domainStartMs: number;
  nowMs: number;
  onMetricRefHover?: (on: boolean) => void;
  /** Inside the summary's own scroll: no overlay, no top inset. */
  embedded?: boolean;
}) {
  devRenderCount("ChartsView");
  // The response is tagged with the query that produced it — staleness (and
  // therefore "loading") is derived, never set synchronously in the effect.
  const [result, setResult] = useState<{ query: string; data: SeriesResponse } | null>(null);

  const domainDays = (nowMs - domainStartMs) / 86_400_000;
  const domainMs = Math.max(1, nowMs - domainStartMs);

  // null = follow the domain. An explicit choice is kept only while it stays
  // viable, so changing the period cannot strand the chart on 1-minute
  // buckets across 90 days.
  const [chosenBucket, setChosenBucket] = useState<string | null>(null);
  const chosenViable = BUCKETS.find((b) => b.id === chosenBucket && bucketViable(domainMs, b.seconds));
  const bucket = chosenViable ?? chartDefaultBucket(domainMs);

  const query = `${aggQuery}&bucket=${bucket.id}`;
  const series = result?.query === query ? result.data : null;
  const loading = series == null;

  // Live while the filters admit the present — the exact test the timebar's
  // LIVE zone uses, so the two can never disagree. 24h/7d/30d and the
  // unfiltered span all qualify; a date range that ended in the past, or a
  // night-only filter during the day, correctly does not.
  const isLive = instantMatches(filters, nowMs);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/series?${query}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((body: SeriesResponse) => {
          if (!cancelled) setResult({ query, data: body });
        })
        .catch(() => {});
    load();
    if (!isLive) return () => {
      cancelled = true;
    };
    const timer = setInterval(load, LIVE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [query, isLive]);

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
    <div className={embedded ? "" : "absolute inset-0 z-10 overflow-y-auto bg-background"}>
      <div className={embedded ? "mx-auto max-w-4xl px-6 pb-16 pt-4 md:px-10" : "mx-auto max-w-4xl px-6 pb-16 pt-[4.5rem] md:px-10"}>
        {/* Like the ranking and the comparison above: a heading that says
            what the charts are of, and for which selection. */}
        {embedded && (
          <div className="mb-6">
            <h2 className="text-[15px] font-semibold tracking-tight">{tr.charts.groupTitle}</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              <MetricMention metric={metric} onHover={onMetricRefHover} /> · <ScopeChip />
            </p>
          </div>
        )}
        <div className="flex flex-col gap-10">
          <Section title={tr.heat.title} caption={tr.heat.caption}>
            {loading || !series ? (
              <Skeleton />
            ) : (
              <WeekSection cells={series.dowHours} metric={metric} hourMask={hourMask} dowMask={dowMask} filtered={hourMask.includes(false) || dowMask.includes(false)} />
            )}
          </Section>

          <Section
            scoped
            title={tr.charts.timeline}
            caption={
              <>
                <MetricMention metric={metric} onHover={onMetricRefHover} />
                {isLive && (
                  <span className="ml-2 inline-flex items-center gap-1 align-baseline">
                    <span className="relative inline-flex size-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sound opacity-60" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-sound" />
                    </span>
                    <span className="text-[9.5px] font-semibold tracking-[0.1em] text-sound">LIVE</span>
                  </span>
                )}
              </>
            }
            aside={<BucketPicker domainMs={domainMs} active={bucket.id} onChange={setChosenBucket} />}
          >
            {loading || !series ? (
              <Skeleton />
            ) : (
              <TimelineChart
                points={series.timeline}
                metric={metric}
                bucketSeconds={series.bucketSeconds}
                onMetricRefHover={onMetricRefHover}
              />
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
