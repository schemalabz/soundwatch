"use client";

// Orchestrates the dashboard: filter state, the data range (from
// /api/freshness), the playback clock, and the responsive frame — filter
// rail + horizontal timebar on desktop, sheet + vertical timebar on mobile.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { dashboardStrings as tr, LOCALE } from "@/lib/strings/dashboard";
import { SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  advanceCursor,
  EMPTY_FILTERS,
  filtersToAggregateQuery,
  instantMatches,
  isUnfiltered,
  periodStartMs,
  selectedSegments,
  type DashboardFilters,
} from "@/lib/dashboard/filters";
import type { FrameData } from "@/lib/dashboard/frames";
import type { FreshnessResponse } from "@/types/freshness";
import FilterRail from "./FilterRail";
import SensorLayer from "./SensorLayer";
import SensorPane from "./SensorPane";
import CurrentDate from "./CurrentDate";
import SkipFlash, { SKIP_HOLD_MS, type SkipEvent } from "./SkipFlash";
import Timebar, { PLAYBACK_SPEEDS, type AggKey, type BarMode } from "./Timebar";
import ViewSwitcher, { type DashboardView } from "./ViewSwitcher";
import Leaderboard from "./views/Leaderboard";
import ChartsView from "./views/ChartsView";

const MapCanvas = dynamic(() => import("./MapCanvas"), { ssr: false });

const FALLBACK_SPAN_DAYS = 90;

export default function DashboardShell() {
  const locale = LOCALE;
  const isMobile = useIsMobile();
  // The dashboard is inherently client-side (live wall clock, map, viewport
  // orientation): rendering it on the server guarantees hydration mismatches,
  // so paint nothing until mounted. isMobile doubles as the mounted signal.
  const mounted = isMobile !== null;

  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);
  const [cursor, setCursor] = useState<number | "live">("live");
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [freshness, setFreshness] = useState<FreshnessResponse | null>(null);
  const [skip, setSkip] = useState<SkipEvent | null>(null);
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
  const [mode, setMode] = useState<BarMode>("instants");
  const [view, setView] = useState<DashboardView>("map");
  const [aggKey, setAggKey] = useState<AggKey>("laeq");
  const [aggData, setAggData] = useState<Record<string, Record<AggKey, number> & { n: number }> | null>(null);
  const skipSeq = useRef(0);
  const skipHoldUntilRef = useRef(0);
  // Stable identity: MapCanvas keys its (create/destroy!) effect on the
  // onReady callback, and the shell re-renders every second — an inline
  // arrow here would tear the map down each tick. setState is stable.
  const [mapInstance, setMapInstance] = useState<import("mapbox-gl").Map | null>(null);

  // Wall clock: the live edge of the rail creeps forward once a second.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Data range + liveness from the pipeline.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/freshness", { cache: "no-store" });
        if (res.ok && !cancelled) setFreshness((await res.json()) as FreshnessResponse);
      } catch {
        // Non-fatal: the bar falls back to a 90-day window.
      }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const rangeStartMs = useMemo(() => {
    const spanDays = freshness?.fleet.oldestDataDays ?? FALLBACK_SPAN_DAYS;
    return nowMs - spanDays * 86_400_000;
  }, [freshness, nowMs]);

  // Segments are memoized on a minute-quantized clock: recomputing the
  // 90-day Athens-wall-time walk every second would be wasted work.
  const nowMinute = Math.floor(nowMs / 60_000) * 60_000;
  const effectiveStartMs = periodStartMs(filters, rangeStartMs, nowMs);
  const rangeStartMinute = Math.floor(effectiveStartMs / 60_000) * 60_000;
  const segments = useMemo(
    () => selectedSegments(filters, rangeStartMinute, nowMinute),
    [filters, rangeStartMinute, nowMinute]
  );
  const filtered = !isUnfiltered(filters);
  const liveAllowed = useMemo(() => instantMatches(filters, nowMinute), [filters, nowMinute]);

  // Filter changes flow through here so a live cursor that the new filters
  // exclude gets parked at the end of the last selected segment (an event-
  // driven transition, not an effect).
  const applyFilters = useCallback(
    (next: DashboardFilters) => {
      setFilters(next);
      setCursor((prev) => {
        if (prev !== "live") return prev;
        if (instantMatches(next, Date.now())) return prev;
        const segs = selectedSegments(next, Math.floor(periodStartMs(next, rangeStartMs, Date.now()) / 60_000) * 60_000, nowMinute);
        return segs.length > 0 ? segs[segs.length - 1].endMs - 1 : prev;
      });
    },
    [rangeStartMs, nowMinute]
  );

  // Playback is a FRAME clock, not an animation: one discrete step per real
  // second. Each tick the cursor jumps by the whole step (10min/1h/6h of sim
  // time) with no intermediate times — the future map layer renders exactly
  // one data frame per tick, and filter-excluded periods are skipped by
  // advanceCursor. Mutable inputs flow through a ref so the interval starts
  // once per play and never loses its cadence.
  const playbackInputs = useRef({ segments, liveAllowed, rangeStartMs });
  useEffect(() => {
    playbackInputs.current = { segments, liveAllowed, rangeStartMs };
  }, [segments, liveAllowed, rangeStartMs]);

  useEffect(() => {
    if (!playing) return;
    const stepMs = PLAYBACK_SPEEDS[speedIndex].simSecondsPerRealSecond * 1000;
    const timer = setInterval(() => {
      // A skip is a held beat: the clock stands still on the landing frame
      // while the jump cut plays, then stepping resumes.
      if (Date.now() < skipHoldUntilRef.current) return;
      const { segments: segs, liveAllowed: allowed, rangeStartMs: start } = playbackInputs.current;
      setCursor((prev) => {
        const from = prev === "live" ? (segs[0]?.startMs ?? start) : prev;
        const next = advanceCursor(segs, from, stepMs);
        if (next == null) {
          setPlaying(false);
          return allowed ? "live" : prev;
        }
        // Landing further than one step away means a gap was skipped: flash
        // the jump cut so the discontinuity reads as intentional.
        if (next - from > stepMs + 1) {
          setSkip({ seq: ++skipSeq.current, targetMs: next });
          skipHoldUntilRef.current = Date.now() + SKIP_HOLD_MS;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [playing, speedIndex]);

  // Aggregate-over-the-filtered-set data feeds both the aggregate map mode
  // and the leaderboard: one fetch per (filters, domain) — the response
  // carries every metric, so flipping between them costs nothing.
  const aggQuery = filtersToAggregateQuery(filters, rangeStartMinute);
  const needsAgg = mode === "aggregate" || view === "board";
  useEffect(() => {
    if (!needsAgg) return;
    let cancelled = false;
    fetch(`/api/aggregate?${aggQuery}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body: { sensors: Record<string, Record<AggKey, number> & { n: number }> }) => {
        if (!cancelled) setAggData(body.sensors);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [needsAgg, aggQuery]);

  const overrideFrame: FrameData | null = useMemo(() => {
    if (mode !== "aggregate" || !aggData) return null;
    const out: FrameData = {};
    for (const [id, v] of Object.entries(aggData)) out[id] = { laeq: v[aggKey], n: v.n };
    return out;
  }, [mode, aggData, aggKey]);

  const onModeChange = useCallback((m: BarMode) => {
    setMode(m);
    if (m === "aggregate") setPlaying(false);
  }, []);

  const onViewChange = useCallback((v: DashboardView) => {
    setView(v);
    if (v !== "map") setPlaying(false);
  }, []);

  const onGoToMap = useCallback(
    (lng: number, lat: number) => {
      setView("map");
      mapInstance?.flyTo({ center: [lng, lat], zoom: 13.5, duration: 1400 });
    },
    [mapInstance]
  );

  const onPlayToggle = useCallback(() => {
    setPlaying((p) => {
      if (!p) {
        const lastEnd = segments[segments.length - 1]?.endMs ?? nowMs;
        // Play from live, or from a cursor parked at the very end, means
        // replaying the selection from its start.
        if (cursor === "live" || (typeof cursor === "number" && cursor >= lastEnd - 60_000)) {
          setCursor(segments[0]?.startMs ?? rangeStartMs);
        }
      }
      return !p;
    });
  }, [cursor, segments, rangeStartMs, nowMs]);

  const onCursorChange = useCallback((c: number | "live") => {
    setCursor(c);
    if (c === "live") setPlaying(false);
  }, []);

  // A single contiguous selection ZOOMS the bar: the domain becomes that
  // interval (graduations re-densify to it) and no highlight is drawn —
  // highlights only exist to mark a selection inside a larger domain.
  const singleInterval = segments.length === 1;
  const domainStartMs = singleInterval ? segments[0].startMs : effectiveStartMs;
  const domainEndMs = singleInterval ? (liveAllowed ? nowMs : segments[0].endMs) : nowMs;

  const timebarProps = {
    rangeStartMs: domainStartMs,
    nowMs: domainEndMs,
    segments,
    filtered: filtered && !singleInterval,
    cursor,
    playing,
    speedIndex,
    liveAllowed,
    freshSecondsAgo: freshness?.fleet.newestSecondsAgo ?? null,
    locale,
    labels: tr.timebar,
    onCursorChange,
    onPlayToggle,
    onSpeedSelect: (i: number) => setSpeedIndex(Math.max(0, Math.min(PLAYBACK_SPEEDS.length - 1, i))),
  };

  const activeFilterCount =
    (filters.period ? 1 : 0) + filters.days.size + filters.hours.size + filters.months.size;
  const railProps = {
    filters,
    segments,
    dataStartMs: rangeStartMs,
    nowMs,
    sensorCount: freshness?.fleet.total ?? 50,
    metric: aggKey,
    onMetricChange: setAggKey,
    onChange: applyFilters,
  };

  if (!mounted) return <div className="h-full bg-background" />;

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-full min-h-0">
        {/* desktop filter rail */}
        {isMobile === false && (
          <aside className="w-[19rem] shrink-0 border-r bg-sidebar">
            <FilterRail {...railProps} />
          </aside>
        )}

        {/* map + overlays */}
        <div className="relative min-w-0 flex-1">
          <MapCanvas onReady={setMapInstance} />
          <SensorLayer
            map={mapInstance}
            cursor={cursor}
            stepMs={PLAYBACK_SPEEDS[speedIndex].simSecondsPerRealSecond * 1000}
            segments={segments}
            playing={playing}
            metric={aggKey}
            onSensorClick={setSelectedSensorId}
            overrideFrame={overrideFrame}
          />
          {view === "board" && (
            <Leaderboard aggData={aggData} metric={aggKey} onSensorClick={setSelectedSensorId} />
          )}
          {view === "charts" && (
            <ChartsView
              aggQuery={aggQuery}
              metric={aggKey}
              filters={filters}
              domainStartMs={rangeStartMinute}
              nowMs={nowMinute}
            />
          )}
          {selectedSensorId && (
            <SensorPane
              sensorId={selectedSensorId}
              onClose={() => setSelectedSensorId(null)}
              onGoToMap={view !== "map" ? onGoToMap : undefined}
            />
          )}
          {view === "map" && <SkipFlash skip={skip} />}
          {view === "map" && mode === "instants" && (
            <CurrentDate cursorMs={cursor === "live" ? nowMs : cursor} skip={skip} />
          )}

          {/* view switcher: the top-level lens */}
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 md:top-4">
            <ViewSwitcher
              view={view}
              mode={mode}
              compact={isMobile === true}
              onViewChange={onViewChange}
              onModeChange={onModeChange}
            />
          </div>

          {/* mobile: filter sheet trigger */}
          {isMobile === true && (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="absolute left-3 top-3 z-10 h-9 gap-2 bg-card/95 shadow-sm backdrop-blur-sm">
                  <SlidersHorizontal className="size-3.5" />
                  {tr.filters}
                  {activeFilterCount > 0 && (
                    <Badge className="size-4 justify-center rounded-full bg-sound p-0 text-[10px] text-white">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[19rem] p-0">
                <SheetTitle className="sr-only">{tr.filters}</SheetTitle>
                <FilterRail {...railProps} />
              </SheetContent>
            </Sheet>
          )}

          {/* the timebar — instants scope on the map lens only */}
          {view === "map" &&
            mode === "instants" &&
            (isMobile === true ? (
              <div className="pointer-events-none absolute bottom-24 right-2 top-16 z-10 flex">
                <Timebar {...timebarProps} orientation="vertical" />
              </div>
            ) : (
              <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex px-4">
                <Timebar {...timebarProps} orientation="horizontal" />
              </div>
            ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
