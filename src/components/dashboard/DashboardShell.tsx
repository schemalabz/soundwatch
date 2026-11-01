"use client";

// Orchestrates the dashboard: Σύνοψη (the page: the filtered time-set on the
// map, ranked and charted) and Χρονογραμμή (the map, minute by minute, with
// the timebar), the filter state the summary answers to, the data range (from
// /api/freshness), the playback clock the map answers to, the «usual» the
// map's circles are held against, and the responsive frame — rail + horizontal
// timebar on desktop, sheet + vertical timebar on mobile.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { dashboardStrings as tr, LOCALE } from "@/lib/strings/dashboard";
import { ArrowLeft, Clock3, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
import {
  frameWindowS,
  quantizeFrameMs,
  type FrameData,
} from "@/lib/dashboard/frames";
import { nextAthensMidnight } from "@/lib/dashboard/time";
import { countVersusUsual, usualWindow } from "@/lib/dashboard/usual";
import type { FreshnessResponse } from "@/types/freshness";
import type { DeparturesResponse, UsualBand, UsualDayResponse } from "@/lib/api/dashboard";
import { reverseGeocode } from "@/lib/dashboard/geocode";
import { summarySentence } from "@/lib/dashboard/summary";
import { pageTitle, siteStrings } from "@/lib/strings/site";
import FilterRail from "./FilterRail";
import NowRail from "./NowRail";
import SensorLayer, { type SensorMeta } from "./SensorLayer";
import LocationLayer from "./LocationLayer";
import SensorPane from "./SensorPane";
import CurrentDate from "./CurrentDate";
import SimulatedBanner from "./SimulatedBanner";
import SkipFlash, { SKIP_HOLD_MS, type SkipEvent } from "./SkipFlash";
import Timebar, { PLAYBACK_SPEEDS } from "./Timebar";
import { type AggKey } from "@/lib/dashboard/metrics";
import SummaryView from "./views/SummaryView";
import { devRenderCount } from "@/lib/dashboard/devtools";

const MapCanvas = dynamic(() => import("./MapCanvas"), { ssr: false });

const FALLBACK_SPAN_DAYS = 90;
// The band for a day changes as yesterday's hours close; a live map asks
// again this often.
const USUAL_REFRESH_MS = 10 * 60_000;

// Σύνοψη is the page; Χρονογραμμή («map» here, after what it shows) is the
// view it opens. Each has its own address, so a link to the timeline opens
// the timeline. Moving between them pushes the path natively (no page load:
// the map and its state stay); back and forward move between them again.
export type DashboardView = "map" | "summary";
const VIEW_PATH: Record<DashboardView, string> = { map: "/timeline", summary: "/" };
// Kept in step with each page's metadata: a native pushState leaves the title alone.
const VIEW_TITLE: Record<DashboardView, string> = {
  map: pageTitle(siteStrings.timeline.title),
  summary: siteStrings.title,
};
function viewForPath(pathname: string): DashboardView {
  return pathname.replace(/\/+$/, "") === VIEW_PATH.map ? "map" : "summary";
}

// The sensors are fitted into the part of the canvas each view leaves
// visible. Σύνοψη shows the map through a cutout at the top (46vh, at least
// 16rem — SummaryView's classes) with a chip in its bottom-left and the
// timeline button top-right; Χρονογραμμή has its title on top and the timebar
// along the bottom (desktop) or the right edge (phones). CSS pixels, so this
// stays in step with those classes by hand.
const SUMMARY_CUTOUT_VH = 0.46;
const SUMMARY_CUTOUT_MIN_PX = 256;
type Padding = { top: number; right: number; bottom: number; left: number };
function viewPadding(view: DashboardView, canvasHeightPx: number, mobile: boolean): Padding {
  if (view === "summary") {
    const cutout = Math.min(canvasHeightPx, Math.max(window.innerHeight * SUMMARY_CUTOUT_VH, SUMMARY_CUTOUT_MIN_PX));
    // Leave at least a strip of map to fit into, whatever the viewport.
    const bottom = Math.min(canvasHeightPx - cutout + 56, Math.max(0, canvasHeightPx - 120));
    return { top: 64, right: 24, bottom, left: 24 };
  }
  return mobile ? { top: 64, right: 80, bottom: 104, left: 16 } : { top: 64, right: 24, bottom: 112, left: 24 };
}
// A sensor fitted alone would otherwise zoom to the street.
const FIT_MAX_ZOOM = 13.5;

export default function DashboardShell({ initialView = "summary" }: { initialView?: DashboardView }) {
  devRenderCount("DashboardShell");

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
  const [sensorList, setSensorList] = useState<SensorMeta[]>([]);
  const [skip, setSkip] = useState<SkipEvent | null>(null);
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
  const [view, setView] = useState<DashboardView>(initialView);
  const [placingPin, setPlacingPin] = useState(false);
  // A metric mention elsewhere is being hovered — the rail picker lights up.
  const [metricGlow, setMetricGlow] = useState(false);
  const [aggKey, setAggKey] = useState<AggKey>("laeq");
  // Tagged with the query that produced it: while a new filter's answer is
  // on its way, the ranking shows as stale instead of silently old.
  const [agg, setAgg] = useState<{
    query: string;
    data: Record<string, Record<AggKey, number> & { n: number }>;
  } | null>(null);
  // What the circles show right now, lifted from the map layer so the rail
  // and the pane read the same numbers the circles do.
  const [frame, setFrame] = useState<FrameData | null>(null);
  // The usual for the cursor's day, every sensor, every hour — one fetch per
  // (day, kind of day), looked up per hour as the cursor moves.
  const [usualDay, setUsualDay] = useState<UsualDayResponse | null>(null);
  const [departures, setDepartures] = useState<DeparturesResponse | null>(null);
  // Phones: the rail is a sheet. Controlled, so a departure tapped inside it
  // can close it and show the map it just moved.
  const [sheetOpen, setSheetOpen] = useState(false);
  const skipSeq = useRef(0);
  const skipHoldUntilRef = useRef(0);
  // Stable identity: MapCanvas keys its (create/destroy!) effect on the
  // onReady callback, and the shell re-renders every second — an inline
  // arrow here would tear the map down each tick. setState is stable.
  const [mapInstance, setMapInstance] = useState<
    import("mapbox-gl").Map | null
  >(null);
  // A place to fly to once the view it belongs to is up (a pane's «show in
  // the timeline»): consumed by the camera effect below, which otherwise
  // fits the sensors — the two must not race.
  const pendingFlyRef = useRef<[number, number] | null>(null);
  const fittedOnceRef = useRef(false);

  // Wall clock: the live edge of the rail creeps forward once a second.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fleet metadata, fetched once and shared by every consumer (markers,
  // leaderboard names, location-pin viability in the rail).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/sensors", { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (
          list: {
            id: string;
            name: string | null;
            address: string | null;
            latitude: number | null;
            longitude: number | null;
          }[],
        ) => {
          if (cancelled) return;
          setSensorList(
            list
              .filter((s) => s.latitude != null && s.longitude != null)
              .map((s) => ({
                id: s.id,
                name: s.name,
                address: s.address,
                latitude: s.latitude!,
                longitude: s.longitude!,
              })),
          );
        },
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Data range + liveness from the pipeline.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/freshness", { cache: "no-store" });
        if (res.ok && !cancelled)
          setFreshness((await res.json()) as FreshnessResponse);
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

  // Minute-quantized clock for everything that doesn't display seconds —
  // memoized children key their props off these, so the per-second wall
  // clock never reaches them.
  const nowMinute = Math.floor(nowMs / 60_000) * 60_000;

  // Hour-quantized on BOTH factors: deriving this from the ticking clock
  // (or from freshness's float day-span, which grows a little on every 5s
  // poll) made dataStartMs a fresh value constantly and silently defeated
  // React.memo on the whole rail — measured before the fix: rail rendered
  // 1:1 with the shell's 1 Hz clock. Domain-start precision is cosmetic at
  // 90 days; an hour of quantization is invisible. Plain arithmetic on
  // quantized inputs — number props memo-compare by value, no useMemo needed.
  const spanDays = freshness?.fleet.oldestDataDays ?? FALLBACK_SPAN_DAYS;
  const rangeStartMs =
    Math.floor(nowMs / 3600_000) * 3600_000 -
    Math.round(spanDays * 24) * 3600_000;

  // Segments are memoized on the minute-quantized clock: recomputing the
  // 90-day Athens-wall-time walk every second would be wasted work.
  const effectiveStartMs = periodStartMs(filters, rangeStartMs, nowMs);
  const rangeStartMinute = Math.floor(effectiveStartMs / 60_000) * 60_000;
  const segments = useMemo(
    () => selectedSegments(filters, rangeStartMinute, nowMinute),
    [filters, rangeStartMinute, nowMinute],
  );
  const filtered = !isUnfiltered(filters);
  const liveAllowed = useMemo(
    () => instantMatches(filters, nowMinute),
    [filters, nowMinute],
  );

  // Filter changes flow through here so a live cursor that the new filters
  // exclude gets parked at the end of the last selected segment (an event-
  // driven transition, not an effect).
  const applyFilters = useCallback(
    (next: DashboardFilters) => {
      setFilters(next);
      setCursor((prev) => {
        if (prev !== "live") return prev;
        if (instantMatches(next, Date.now())) return prev;
        const segs = selectedSegments(
          next,
          Math.floor(periodStartMs(next, rangeStartMs, Date.now()) / 60_000) *
            60_000,
          nowMinute,
        );
        return segs.length > 0 ? segs[segs.length - 1].endMs - 1 : prev;
      });
    },
    [rangeStartMs, nowMinute],
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
      const {
        segments: segs,
        liveAllowed: allowed,
        rangeStartMs: start,
      } = playbackInputs.current;
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

  // Aggregate-over-the-filtered-set data feeds the summary's ranking: one
  // fetch per (filters, domain) — the response carries every metric, so
  // flipping between them costs nothing.
  const aggQuery = filtersToAggregateQuery(filters, rangeStartMinute);
  const needsAgg = view === "summary";
  useEffect(() => {
    if (!needsAgg) return;
    let cancelled = false;
    fetch(`/api/aggregate?${aggQuery}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (body: {
          sensors: Record<string, Record<AggKey, number> & { n: number }>;
        }) => {
          if (!cancelled) setAgg({ query: aggQuery, data: body.sensors });
        },
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [needsAgg, aggQuery]);
  const aggData = agg?.data ?? null;
  const aggStale = agg != null && agg.query !== aggQuery;
  // On Σύνοψη the circles show each place's aggregate over the filtered
  // time-set — the map at the top of the summary is the ranking, drawn.
  const summaryFrame = useMemo<FrameData | null>(() => {
    if (view !== "summary" || !aggData) return null;
    const out: FrameData = {};
    for (const [id, v] of Object.entries(aggData)) out[id] = { laeq: v[aggKey], n: v.n };
    return out;
  }, [view, aggData, aggKey]);
  // What the ranking is OF, said in the rail's own words.
  const filterQualifiers = useMemo(
    () => summarySentence(filters, rangeStartMs, nowMinute).qualifiers,
    [filters, rangeStartMs, nowMinute],
  );

  // The moment on display, to the minute: the frame the circles show ends
  // here. Everything «usual» keys off it.
  const isLive = cursor === "live";
  const cursorMinute = isLive ? nowMinute : quantizeFrameMs(cursor);
  const cursorWin = useMemo(() => usualWindow(cursorMinute), [cursorMinute]);
  const { dayStartMs: cursorDayStartMs, dayType: cursorDayType } = cursorWin;
  const todayStartMs = useMemo(() => usualWindow(nowMinute).dayStartMs, [nowMinute]);

  // The usual for the cursor's day: refetched when the day (or its kind)
  // changes, and every ten minutes while live so a newly closed hour counts.
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/usual?at=${cursorDayStartMs + 3600_000}&day=1`, { cache: "no-store" })
        .then((r) => r.json())
        .then((body: UsualDayResponse) => {
          if (!cancelled) setUsualDay(body);
        })
        .catch(() => {});
    load();
    const timer = isLive ? setInterval(load, USUAL_REFRESH_MS) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [cursorDayStartMs, cursorDayType, isLive]);

  // The cursor's day, cut at now when live and at the last instant of that
  // day when scrubbing (the rail then hides what came after the cursor). The
  // Athens day is 23 or 25 hours twice a year, so the next midnight is
  // probed, never added. Minute precision: while that day is today this
  // refetches once a minute.
  const departuresAtMs = isLive ? nowMinute : Math.min(nowMinute, nextAthensMidnight(cursorDayStartMs) - 1);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/departures?at=${departuresAtMs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body: DeparturesResponse) => {
        if (!cancelled) setDepartures(body);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [departuresAtMs]);

  // The band for the cursor's hour, per sensor: what the circles are judged
  // against. null until the day's usual has landed.
  const usualForHour = useMemo<Record<string, UsualBand> | null>(() => {
    if (!usualDay || usualDay.dayStartMs !== cursorWin.dayStartMs) return null;
    const out: Record<string, UsualBand> = {};
    for (const [id, hours] of Object.entries(usualDay.sensors)) {
      const band = hours[cursorWin.hour];
      if (band) out[id] = band;
    }
    return out;
  }, [usualDay, cursorWin]);

  // While scrubbing, the rail shows the day's departures up to the cursor.
  // The phone's sheet button carries how many places are above their usual,
  // so the map's one finding is visible without opening anything.
  const aboveCount = useMemo(
    () => countVersusUsual(sensorList.map((s) => s.id), frame, usualForHour).above,
    [sensorList, frame, usualForHour],
  );

  const departuresShown = useMemo<DeparturesResponse | null>(() => {
    if (!departures) return null;
    if (departures.dayStartMs !== cursorWin.dayStartMs) return null;
    if (isLive) return departures;
    return {
      ...departures,
      episodes: departures.episodes
        .filter((e) => e.peakAtMs <= cursorMinute)
        .map((e) => ({ ...e, ongoing: false })),
    };
  }, [departures, cursorWin, isLive, cursorMinute]);

  const showView = useCallback((v: DashboardView) => {
    setView(v);
    if (viewForPath(window.location.pathname) !== v) {
      window.history.pushState(null, "", `${VIEW_PATH[v]}${window.location.search}`);
    }
  }, []);

  // After the render, so it lands after Next re-applies the loaded page's
  // own metadata on back/forward.
  useEffect(() => {
    document.title = VIEW_TITLE[view];
  }, [view]);

  // Back and forward move between the lenses.
  useEffect(() => {
    const onPop = () => {
      setView(viewForPath(window.location.pathname));
      setSelectedSensorId(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // A pane opened on one lens does not follow you to the other: on a phone
  // it would cover the view just switched to. A row there reopens it.
  const onViewChange = useCallback(
    (v: DashboardView) => {
      showView(v);
      setSelectedSensorId(null);
      if (v !== "map") setPlaying(false);
    },
    [showView],
  );

  // Pin placement happens on the summary's own map (the cutout, which
  // SummaryView scrolls back into view when this arms); the pin lands
  // immediately with a null label and the reverse-geocoded street name
  // streams in when Mapbox answers.
  const onTogglePlacing = useCallback(() => {
    setPlacingPin((prev) => !prev);
  }, []);

  const onPlacePin = useCallback((lng: number, lat: number) => {
    setPlacingPin(false);
    setFilters((prev) => ({
      ...prev,
      locations: [...prev.locations, { lng, lat, radiusM: 500, label: null }],
    }));
    reverseGeocode(lng, lat).then((label) => {
      if (!label) return;
      setFilters((prev) => ({
        ...prev,
        locations: prev.locations.map((p) =>
          p.lng === lng && p.lat === lat ? { ...p, label } : p,
        ),
      }));
    });
  }, []);

  // Address search picks arrive labeled; show the new pin where the map is
  // visible on this view.
  const onAddPin = useCallback(
    (lng: number, lat: number, label: string) => {
      setFilters((prev) => ({
        ...prev,
        locations: [...prev.locations, { lng, lat, radiusM: 500, label }],
      }));
      if (mapInstance && isMobile !== null)
        mapInstance.flyTo({
          center: [lng, lat],
          zoom: Math.max(mapInstance.getZoom(), 12.5),
          padding: viewPadding(view, mapInstance.getContainer().clientHeight, isMobile),
          duration: 1200,
        });
    },
    [view, mapInstance, isMobile],
  );

  const onRemovePin = useCallback((index: number) => {
    setFilters((prev) => ({
      ...prev,
      locations: prev.locations.filter((_, i) => i !== index),
    }));
  }, []);

  const onClosePane = useCallback(() => setSelectedSensorId(null), []);

  const onGoToMap = useCallback(
    (lng: number, lat: number) => {
      pendingFlyRef.current = [lng, lat];
      showView("map");
    },
    [showView],
  );

  // The camera follows the view: each one fits every sensor into the part
  // of the canvas it leaves visible — at once on first paint, eased when
  // moving between views — unless a place was asked for.
  useEffect(() => {
    if (!mapInstance || isMobile === null || sensorList.length === 0) return;
    const padding = viewPadding(view, mapInstance.getContainer().clientHeight, isMobile);
    const fly = pendingFlyRef.current;
    pendingFlyRef.current = null;
    if (fly) {
      mapInstance.flyTo({ center: fly, zoom: FIT_MAX_ZOOM, padding, duration: 1400 });
      return;
    }
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const { longitude: x, latitude: y } of sensorList) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
    mapInstance.fitBounds([[w, s], [e, n]], {
      padding,
      maxZoom: FIT_MAX_ZOOM,
      duration: fittedOnceRef.current ? 700 : 0,
    });
    fittedOnceRef.current = true;
  }, [mapInstance, view, sensorList, isMobile]);

  // A departure in the rail: scrub to the end of its peak window (so the
  // frame on the map IS that window) and open the place.
  const onJumpTo = useCallback(
    (epochMs: number) => {
      setPlaying(false);
      showView("map");
      setCursor(quantizeFrameMs(epochMs + 600_000));
      setSheetOpen(false);
    },
    [showView],
  );

  const onPlayToggle = useCallback(() => {
    setPlaying((p) => {
      if (!p) {
        const lastEnd = segments[segments.length - 1]?.endMs ?? nowMs;
        // Play from live, or from a cursor parked at the very end, means
        // replaying the selection from its start.
        if (
          cursor === "live" ||
          (typeof cursor === "number" && cursor >= lastEnd - 60_000)
        ) {
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
  const domainEndMs = singleInterval
    ? liveAllowed
      ? nowMs
      : segments[0].endMs
    : nowMs;

  const stepMs = PLAYBACK_SPEEDS[speedIndex].simSecondsPerRealSecond * 1000;
  const windowS = frameWindowS(stepMs);

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
    onSpeedSelect: (i: number) =>
      setSpeedIndex(Math.max(0, Math.min(PLAYBACK_SPEEDS.length - 1, i))),
  };

  const activeFilterCount =
    (filters.period ? 1 : 0) +
    filters.days.size +
    filters.hours.size +
    filters.months.size;

  const railProps = {
    filters,
    segments,
    dataStartMs: rangeStartMs,
    // Minute precision on purpose: with React.memo this caps the rail (50
    // chips + 21 viability probes) at one re-render per minute, not per
    // second. Only the Timebar needs the ticking clock.
    nowMs: nowMinute,
    sensorCount: freshness?.fleet.total ?? 50,
    sensors: sensorList,
    metric: aggKey,
    onMetricChange: setAggKey,
    onChange: applyFilters,
    placingPin,
    onTogglePlacing,
    onAddPin,
    metricGlow,
  };

  const rail =
    view === "map" ? (
      <NowRail
        cursorMs={cursorMinute}
        live={isLive}
        isToday={cursorDayStartMs === todayStartMs}
        windowS={windowS}
        sensors={sensorList}
        frame={frame}
        usual={usualForHour}
        departures={departuresShown}
        freshness={freshness}
        onJumpTo={onJumpTo}
        onSensorClick={setSelectedSensorId}
      />
    ) : (
      <FilterRail {...railProps} />
    );

  if (!mounted) return <div className="h-full bg-background" />;

  return (
    <TooltipProvider delayDuration={250}>
      {/* Renders only where NEXT_PUBLIC_DATA_SOURCE=simulated, i.e. staging. */}
      <div className="flex h-full min-h-0 flex-col">
        <SimulatedBanner />
        <div className="flex min-h-0 flex-1">
          {/* desktop rail: the moment on the map, the filters beside the summary */}
          {isMobile === false && (
            <aside className="w-[19rem] shrink-0 border-r bg-sidebar">{rail}</aside>
          )}

          {/* map + overlays */}
          <div className="relative min-w-0 flex-1">
            <MapCanvas onReady={setMapInstance} />
            <SensorLayer
              map={mapInstance}
              sensors={sensorList}
              cursor={cursor}
              stepMs={stepMs}
              segments={segments}
              playing={playing}
              metric={aggKey}
              onSensorClick={setSelectedSensorId}
              locations={filters.locations}
              clickThrough={placingPin}
              usual={usualForHour}
              onFrame={setFrame}
              overrideFrame={summaryFrame}
            />
            <LocationLayer
              map={mapInstance}
              locations={filters.locations}
              placing={placingPin}
              onPlace={onPlacePin}
              onRemove={onRemovePin}
            />
            {view === "summary" && (
              <SummaryView
                placingPin={placingPin}
                onOpenTimeline={() => onViewChange("map")}
                aggData={aggData}
                aggStale={aggStale}
                filterQualifiers={filterQualifiers}
                aggQuery={aggQuery}
                metric={aggKey}
                sensors={sensorList}
                filters={filters}
                domainStartMs={rangeStartMinute}
                nowMs={nowMinute}
                onSensorClick={setSelectedSensorId}
                onMetricRefHover={setMetricGlow}
              />
            )}
            {selectedSensorId && (
              <SensorPane
                sensorId={selectedSensorId}
                windowS={windowS}
                cursorMs={cursorMinute}
                live={isLive}
                level={frame?.[selectedSensorId]?.laeq ?? null}
                usualBand={usualForHour ? (usualForHour[selectedSensorId] ?? null) : undefined}
                onClose={onClosePane}
                onGoToMap={view !== "map" ? onGoToMap : undefined}
              />
            )}
            {view === "map" && <SkipFlash skip={skip} />}
            {view === "map" && (
              <CurrentDate
                cursorMs={cursorMinute}
                windowS={windowS}
                skip={skip}
              />
            )}

            {/* the timeline's title, and its way back (browser back works too).
                Phones: top-right, clear of the «Τώρα» sheet trigger and above
                the vertical timebar. */}
            {view === "map" && (
              <div className="pointer-events-none absolute right-2 top-3 z-10 md:left-1/2 md:right-auto md:top-4 md:-translate-x-1/2">
                <button
                  type="button"
                  onClick={() => onViewChange("summary")}
                  aria-label={tr.views.backToSummary}
                  title={tr.views.backToSummary}
                  className="pointer-events-auto flex h-11 items-center gap-2 rounded-xl border bg-card/95 pl-3 pr-4 text-[14px] font-semibold tracking-tight shadow-[0_2px_16px_-4px_rgb(45_49_66/0.18)] backdrop-blur-sm transition-colors hover:bg-card"
                >
                  <ArrowLeft className="size-4 text-muted-foreground" />
                  {tr.views.timeline}
                </button>
              </div>
            )}

            {/* mobile: the rail as a sheet */}
            {isMobile === true && (
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    className="absolute left-3 top-3 z-10 h-11 gap-2 bg-card/95 px-3.5 shadow-sm backdrop-blur-sm"
                  >
                    {view === "map" ? <Clock3 className="size-3.5" /> : <SlidersHorizontal className="size-3.5" />}
                    {view === "map" ? tr.now.sheet : tr.filters}
                    {view === "map" && aboveCount > 0 && (
                      // The map's pill, small: ink means "above its usual".
                      <span
                        aria-label={tr.now.sheetBadge(aboveCount)}
                        className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-foreground px-1.5 text-[11px] font-bold tabular-nums leading-none text-background"
                      >
                        {aboveCount}
                      </span>
                    )}
                    {view !== "map" && activeFilterCount > 0 && (
                      <Badge className="size-4 justify-center rounded-full bg-sound p-0 text-[10px] text-white">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[19rem] p-0">
                  <SheetTitle className="sr-only">{view === "map" ? tr.now.sheet : tr.filters}</SheetTitle>
                  {rail}
                </SheetContent>
              </Sheet>
            )}

            {/* the timebar — the map's only time control */}
            {view === "map" &&
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
      </div>
    </TooltipProvider>
  );
}
