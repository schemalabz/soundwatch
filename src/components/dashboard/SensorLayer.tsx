"use client";

// The animated sensor circles. Design notes, because the constraints matter:
//
// - Markers are DOM elements (mapboxgl.Marker) styled imperatively. CSS
//   transitions do the animation: the browser composites color/scale tweens
//   for 50 elements with zero per-frame JavaScript and zero React renders.
// - Frame data lives in a FrameStore inside a ref. The ONLY React state is a
//   version counter (bumped when a fetch lands) and the sensor list. Cursor
//   changes flow in as props; an effect applies the current frame's values
//   to the marker elements directly.
// - The prefetcher batches the next frames along the (gap-skipping) playback
//   path into one request, marks them pending to dedupe, and evicts old
//   frames beyond a cap — memory stays flat over long sessions.
// - Live mode reuses /api/sensors (latestReading IS the live frame), polled
//   gently, with a slow "creep" transition instead of the 1s playback tween.
// - The circle is the level. The pill beside it is the one other thing the
//   map says: this place is outside its own usual for this hour (the rule is
//   src/lib/dashboard/usual.ts). Most places, most of the time, have none.

import { memo, useEffect, useMemo, useReducer, useRef, useState, type RefObject } from "react";
import type mapboxgl from "mapbox-gl";
import {
  FRAME_REQUEST_TIMEOUT_MS,
  FrameStore,
  dropStaleRequests,
  frameKey,
  frameWindowS,
  quantizeFrameMs,
  retryDelayMs,
  upcomingFrameTimes,
  type FrameData,
  type FrameRequest,
} from "@/lib/dashboard/frames";
import { audibleRadiusM, levelColor, metersPerPixel, paletteStops } from "@/lib/dashboard/levels";
import { withinLocations, type LocationPin, type TimeSegment } from "@/lib/dashboard/filters";
import { classify, fmtDelta, hasSupport, usualDelta } from "@/lib/dashboard/usual";
import { devExpose, devRenderCount } from "@/lib/dashboard/devtools";
import type { ApiSensorListItem } from "@/lib/api/schemas";
import type { UsualBand } from "@/lib/api/dashboard";

// The identity fields come from the published contract, so a rename in
// ApiSensorListItem breaks here rather than arriving as undefined. Coordinates
// are deliberately narrowed to non-null: the map only ever receives sensors
// that PUBLIC_SENSOR_WHERE has already filtered to located ones.
export type SensorMeta = Pick<ApiSensorListItem, "id" | "name" | "address"> & {
  latitude: number;
  longitude: number;
};

export interface SensorLayerProps {
  map: mapboxgl.Map | null;
  /** Fleet metadata, fetched once by the shell. */
  sensors: SensorMeta[];
  cursor: number | "live";
  stepMs: number;
  segments: TimeSegment[];
  playing: boolean;
  /** The aggregation metric applied to every frame window (and live). */
  metric: string;
  onSensorClick?: (sensorId: string) => void;
  /** Spatial filter: markers exist only inside these pins (empty = all). */
  locations?: readonly LocationPin[];
  /** Pin-placement mode: sensor markers must not swallow map clicks. */
  clickThrough?: boolean;
  /** Each sensor's usual band for the cursor's hour; null while unknown. */
  usual?: Record<string, UsualBand> | null;
  /** The frame the circles currently show, lifted for the rail's counts. */
  onFrame?: (frame: FrameData | null) => void;
  /**
   * Σύνοψη: each place's aggregate over the filtered time-set, shown instead
   * of a moment. No pills (there is no hour to be usual for), no polling, and
   * the lifted frame stays the moment's, so the pane keeps saying «now».
   */
  overrideFrame?: FrameData | null;
  /**
   * Filled with "is the frame for this instant still on its way?". The
   * playback clock asks before each step and waits for a loading frame
   * instead of stepping onto circles that would not change.
   */
  frameLoadingRef?: RefObject<((tMs: number) => boolean) | null>;
}

const MARKER_PX = 30;
const TOUCH_HIT_PX = 44;
const PREFETCH_AHEAD = 6;
const LIVE_POLL_MS = 5000;
// Playback tweens run LINEAR over the full frame second: motion is uniform
// through the frame and chains continuously into the next one. A paused
// apply just settles quickly onto the correct value. A time-jump during
// playback animates across the 3s hold (see SkipFlash.SKIP_HOLD_MS) so the
// circles visibly travel to the landing frame under the VHS pass.
const PLAYBACK_TWEEN_MS = 1000;
const PAUSED_TWEEN_MS = 180;
const SKIP_TWEEN_MS = 2600;
const LIVE_TWEEN_MS = 4000;

interface MarkerHandle {
  marker: mapboxgl.Marker;
  circle: HTMLSpanElement;
  label: HTMLSpanElement;
  pill: HTMLSpanElement;
  /** The hover label: the place's name and the level the circle shows. */
  tip: HTMLSpanElement;
  name: string;
}

// The label needs BOTH a close-enough zoom (city scale, not the whole
// basin) and a ring wide enough to frame two digits.
const LABEL_MIN_ZOOM = 12.2;
// Rendered diameter, not a transform factor: the circle is geographic now, so
// its scale means nothing without the zoom it was computed at.
const LABEL_MIN_PX = 22;

function makeMarkerElement(): { root: HTMLDivElement; circle: HTMLSpanElement; label: HTMLSpanElement; pill: HTMLSpanElement; tip: HTMLSpanElement } {
  const root = document.createElement("div");
  // NO inline `position`: mapbox's .mapboxgl-marker class positions the root
  // absolutely and drives it via transform — an inline position:relative
  // overrides that class and drops markers into normal flow (they stack
  // downward off-map). The root still anchors the label: absolutely
  // positioned elements are containing blocks for absolute children.
  // On a touch screen the root grows to a 44 px target; the ring inside is
  // sized and scaled on its own, so only the hit area changes.
  const hitPx = window.matchMedia("(pointer: coarse)").matches ? TOUCH_HIT_PX : MARKER_PX;
  root.style.cssText = `width:${hitPx}px;height:${hitPx}px;display:grid;place-items:center;pointer-events:auto;cursor:pointer;`;
  const circle = document.createElement("span");
  circle.style.cssText = [
    `width:${MARKER_PX}px`,
    `height:${MARKER_PX}px`,
    "border-radius:9999px",
    // The ring is decoration; the 30 px root is the click target, as it always
    // was. Without this the span is hit-tested over its full transformed box —
    // MAX_PX is 900, so a loud sensor at zoom 17 puts a 900x900 target on the
    // map. The root handler calls stopPropagation, so a click anywhere inside
    // it selects that sensor rather than what was aimed at, and a mousedown
    // there never reaches the canvas, making the map undraggable from a wide
    // stretch of itself.
    "pointer-events:none",
    "border:1.5px solid rgba(191,192,192,0.55)", // silver — the no-data state
    "transform:scale(0.35)",
    "opacity:0.6",
    "will-change:transform,opacity",
    `transition:transform ${PLAYBACK_TWEEN_MS}ms linear,border-color ${PLAYBACK_TWEEN_MS}ms linear,opacity 400ms linear,background-color ${PLAYBACK_TWEEN_MS}ms linear`,
  ].join(";");
  // dB value, centered over (not inside) the scaled ring so text never warps.
  const label = document.createElement("span");
  label.style.cssText = [
    "position:absolute",
    "inset:0",
    "display:grid",
    "place-items:center",
    "font-size:8.5px",
    "font-weight:650",
    "font-variant-numeric:tabular-nums",
    "letter-spacing:-0.02em",
    "opacity:0",
    `transition:color ${PLAYBACK_TWEEN_MS}ms linear,opacity 300ms linear`,
    "user-select:none",
  ].join(";");
  // The pill: "+10" on the ring's upper-right edge when the place is outside
  // its usual. Hidden by default — on most circles it never shows.
  const pill = document.createElement("span");
  pill.style.cssText = [
    "position:absolute",
    "left:50%",
    "top:50%",
    "height:18px",
    "padding:0 6px",
    "border-radius:9px",
    "background:var(--sw-ink)",
    "color:var(--sw-paper)",
    "font-size:11px",
    "font-weight:700",
    "line-height:18px",
    "font-variant-numeric:tabular-nums",
    "letter-spacing:0.02em",
    "white-space:nowrap",
    "pointer-events:none",
    "user-select:none",
    "opacity:0",
    "transform:translate(-50%,-50%)",
    "transition:opacity 300ms linear",
  ].join(";");
  // The hover label: which place this is and its level, without a click. At
  // city zoom the rings are too small to carry a number, so until now the
  // only way to learn either was to open the pane, one circle at a time.
  const tip = document.createElement("span");
  tip.style.cssText = [
    "position:absolute",
    "left:50%",
    "bottom:calc(100% + 4px)",
    "transform:translateX(-50%)",
    "padding:3px 7px",
    "border-radius:6px",
    "background:var(--sw-ink)",
    "color:var(--sw-paper)",
    "font-size:11px",
    "font-weight:600",
    "line-height:1.25",
    "font-variant-numeric:tabular-nums",
    "white-space:nowrap",
    "pointer-events:none",
    "user-select:none",
    "opacity:0",
    "transition:opacity 120ms linear",
  ].join(";");
  root.addEventListener("mouseenter", () => {
    tip.style.opacity = "1";
    root.style.zIndex = "5";
  });
  root.addEventListener("mouseleave", () => {
    tip.style.opacity = "0";
    root.style.zIndex = "";
  });
  root.appendChild(circle);
  root.appendChild(label);
  root.appendChild(pill);
  root.appendChild(tip);
  return { root, circle, label, pill, tip };
}

/**
 * Pixel scale for a level: the circle is drawn at its illustrative audible
 * RADIUS, so it keeps a real-world size and grows as you zoom in, rather than
 * staying a fixed dot on screen.
 *
 * The element is MARKER_PX wide and scaled by transform, which keeps the
 * animation on the compositor. Clamped at both ends: below MIN_PX a loud-vs-
 * quiet difference stops being visible and the target stops being clickable;
 * above MAX_PX one sensor swallows the city.
 */
const MIN_PX = 12;
const FILL_PERCENT = 24;
const MAX_PX = 900;

function scaleForLevel(laeq: number, mPerPx: number): number {
  const diameterPx = (2 * audibleRadiusM(laeq)) / mPerPx;
  return Math.min(MAX_PX, Math.max(MIN_PX, diameterPx)) / MARKER_PX;
}

/** Park the pill on the ring's upper-right edge for the ring's current scale. */
function placePill(pill: HTMLSpanElement, scale: number): void {
  // Half the rendered diameter, then along the 45° diagonal; never inside
  // the 30 px root's own corner, so a tiny ring still shows it beside itself.
  const r = Math.max(MARKER_PX / 2, (scale * MARKER_PX) / 2) * 0.72;
  pill.style.transform = `translate(calc(-50% + ${r.toFixed(1)}px), calc(-50% - ${r.toFixed(1)}px))`;
}

/** Apply one sensor's frame value to its circle. null = no data (gray). */
function applyValue(
  h: Pick<MarkerHandle, "circle" | "label" | "pill" | "tip" | "name">,
  laeq: number | null,
  tweenMs: number,
  labelsOn: boolean,
  mPerPx: number,
  band: UsualBand | null | undefined,
  timing: "linear" | "ease" = "linear"
): void {
  const fn = timing === "linear" ? "linear" : "cubic-bezier(0.25,0,0.2,1)";
  h.circle.style.transitionDuration = `${tweenMs}ms,${tweenMs}ms,400ms,${tweenMs}ms`;
  h.circle.style.transitionTimingFunction = `${fn},${fn},linear,${fn}`;
  h.label.style.transitionDuration = `${tweenMs}ms,300ms`;
  h.tip.textContent = laeq == null ? h.name : `${h.name} · ${Math.round(laeq)} dB`;
  if (laeq == null) {
    h.circle.style.borderColor = "color-mix(in srgb, var(--sw-silver) 55%, transparent)";
    h.circle.style.backgroundColor = "transparent";
    h.circle.style.transform = "scale(0.35)";
    h.circle.style.borderWidth = `${(1.5 / 0.35).toFixed(3)}px`;
    h.circle.style.opacity = "0.6";
    h.label.style.opacity = "0";
    h.pill.style.opacity = "0";
  } else {
    const stops = paletteStops();
    const scale = scaleForLevel(laeq, mPerPx);
    const color = levelColor(laeq, stops);
    h.circle.style.borderColor = color;
    // A tint of the ring's own colour: at city zoom the rings are a dozen
    // pixels wide and a 1.5 px outline alone disappears into the streets.
    // Light enough that overlapping circles and the map stay readable.
    h.circle.style.backgroundColor = `color-mix(in srgb, ${color} ${FILL_PERCENT}%, transparent)`;
    h.circle.style.transform = `scale(${scale.toFixed(3)})`;
    // transform scales the border with everything else, so a 40x circle would
    // get a 60px rim. Counter-scale to keep the stroke visually constant.
    h.circle.style.borderWidth = `${(1.5 / scale).toFixed(3)}px`;
    h.circle.style.opacity = "1";
    // Show the value only when zoomed in enough AND the ring can frame it.
    if (labelsOn && scale * MARKER_PX >= LABEL_MIN_PX) {
      h.label.textContent = String(Math.round(laeq));
      h.label.style.color = color;
      h.label.style.opacity = "1";
    } else {
      h.label.style.opacity = "0";
    }
    // The pill fires on the band edge; its number is the distance from the
    // typical hour. A quieter-than-usual place gets the hollow variant.
    if (hasSupport(band) && classify(laeq, band) !== "inside") {
      const delta = usualDelta(laeq, band);
      h.pill.textContent = fmtDelta(delta);
      if (delta > 0) {
        h.pill.style.background = "var(--sw-ink)";
        h.pill.style.color = "var(--sw-paper)";
        h.pill.style.boxShadow = "none";
      } else {
        h.pill.style.background = "var(--sw-paper)";
        h.pill.style.color = "var(--sw-slate)";
        h.pill.style.boxShadow = "inset 0 0 0 1px var(--sw-slate)";
      }
      placePill(h.pill, scale);
      h.pill.style.opacity = "1";
    } else {
      h.pill.style.opacity = "0";
    }
  }
}

function SensorLayer({ map, sensors, cursor, stepMs, segments, playing, metric, onSensorClick, locations, clickThrough, usual, onFrame, overrideFrame, frameLoadingRef }: SensorLayerProps) {
  devRenderCount("SensorLayer");
  const hasOverride = overrideFrame != null;
  const [version, bumpVersion] = useReducer((v: number) => v + 1, 0);
  const [zoomBucket, setZoomBucket] = useState(0);
  const storeRef = useRef(new FrameStore());
  const markersRef = useRef(new Map<string, MarkerHandle>());
  const liveFrameRef = useRef<FrameData>({});
  const lastAppliedRef = useRef<number | "live" | null>(null);
  // Last level shown per sensor. A zoom changes the metres-per-pixel and so
  // the pixel size of every circle, without any new data arriving.
  const lastLevelsRef = useRef(new Map<string, number | null>());
  const onSensorClickRef = useRef(onSensorClick);
  useEffect(() => {
    onSensorClickRef.current = onSensorClick;
  }, [onSensorClick]);
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  // Dev observability: the live FrameStore as window.__swFrameStore.
  useEffect(() => {
    devExpose("FrameStore", storeRef.current);
  }, []);

  // While placing a location pin, clicks must fall through to the map.
  useEffect(() => {
    for (const [, h] of markersRef.current) {
      h.marker.getElement().style.pointerEvents = clickThrough ? "none" : "auto";
    }
  }, [clickThrough, version]);

  // --- zoom tracking ---
  // Two jobs at two rates. Label visibility is a React concern and quantizes
  // to 0.25 so it re-renders rarely. Circle SIZE is geographic, so it must
  // track zoom continuously — that runs imperatively over the marker
  // elements, with transitions off, so the circles stay welded to the ground
  // instead of easing along behind the basemap.
  useEffect(() => {
    if (!map) return;
    const update = () => {
      setZoomBucket(Math.round(map.getZoom() * 4) / 4);
      const mPerPx = metersPerPixel(map.getCenter().lat, map.getZoom());
      for (const [id, handle] of markersRef.current) {
        const laeq = lastLevelsRef.current.get(id);
        if (laeq == null) continue;
        const scale = scaleForLevel(laeq, mPerPx);
        handle.circle.style.transitionDuration = "0ms";
        handle.circle.style.transform = `scale(${scale.toFixed(3)})`;
        handle.circle.style.borderWidth = `${(1.5 / scale).toFixed(3)}px`;
        placePill(handle.pill, scale);
      }
    };
    update();
    map.on("zoom", update);
    return () => {
      map.off("zoom", update);
    };
  }, [map]);

  // --- markers lifecycle ---
  // Location pins simply decide which markers EXIST — frames stay unfiltered
  // (they're per-sensor values, so hiding markers is exact and cache-safe).
  const shownSensors = useMemo(
    () => (locations && locations.length > 0 ? sensors.filter((s) => withinLocations(s.longitude, s.latitude, locations)) : sensors),
    [sensors, locations]
  );
  useEffect(() => {
    if (!map || shownSensors.length === 0) return;
    const markers = markersRef.current;
    let disposed = false;
    let handles: MarkerHandle[] = [];
    // mapbox-gl is loaded dynamically alongside MapCanvas; import for Marker.
    import("mapbox-gl").then(({ default: gl }) => {
      if (disposed) return;
      for (const s of shownSensors) {
        const { root, circle, label, pill, tip } = makeMarkerElement();
        const name = s.name ?? s.address ?? s.id.slice(0, 8);
        root.setAttribute("aria-label", name);
        root.addEventListener("click", (e) => {
          e.stopPropagation();
          onSensorClickRef.current?.(s.id);
        });
        const marker = new gl.Marker({ element: root, anchor: "center" })
          .setLngLat([s.longitude, s.latitude])
          .addTo(map);
        const handle = { marker, circle, label, pill, tip, name };
        markers.set(s.id, handle);
        handles.push(handle);
      }
      lastAppliedRef.current = null; // force a fresh apply
      bumpVersion();
    });
    return () => {
      disposed = true;
      for (const h of handles) h.marker.remove();
      markers.clear();
      handles = [];
    };
  }, [map, shownSensors]);

  // --- live frame polling (only while the playhead is live) ---
  // Live IS a frame: the trailing 5 minutes at "now", computed with the
  // same metric as playback — one data path for everything.
  useEffect(() => {
    if (cursor !== "live" || hasOverride) return;
    let cancelled = false;
    // Live IS a frame, and the frame window follows the playback speed —
    // switching speeds while live changes what "now" aggregates over, and
    // the circles refetch immediately (stepMs is a dependency).
    const windowS = frameWindowS(stepMs);
    const load = async () => {
      try {
        const at = quantizeFrameMs(Date.now());
        const res = await fetch(`/api/frames?at=${at}&window=${windowS}&metric=${metric}&by=received`, { cache: "no-store" });
        const body: { frames: Record<string, FrameData> } = await res.json();
        if (cancelled) return;
        liveFrameRef.current = body.frames[String(at)] ?? {};
        bumpVersion();
      } catch {
        // transient — keep the previous live frame
      }
    };
    load();
    const timer = setInterval(load, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [cursor, metric, stepMs, hasOverride]);

  // --- prefetcher: current frame + the playback path ahead, one batch ---
  const cursorQ = cursor === "live" ? "live" : quantizeFrameMs(cursor);
  const inflightRef = useRef(new Set<FrameRequest>());
  // Failed batches back off: `until` gates the next attempt, and the timer
  // bumps `retryTick` so the attempt happens even when nothing else changes
  // (a paused playhead would otherwise sit on a frame that never loads).
  const backoffRef = useRef({ failures: 0, until: 0 });
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [retryTick, bumpRetry] = useReducer((v: number) => v + 1, 0);
  useEffect(() => {
    const store = storeRef.current;
    const inflight = inflightRef.current;
    if (cursor === "live" || hasOverride) {
      dropStaleRequests(inflight, new Set(), store);
      return;
    }
    const windowS = frameWindowS(stepMs);
    const ahead = playing ? PREFETCH_AHEAD : 2;
    // Walk from the cursor itself, not its quantized minute: the clock steps
    // from the raw value, and across a filter gap the two can land a minute
    // apart — the frame fetched must be the one the clock will ask for.
    const times = upcomingFrameTimes(segments, cursor, stepMs, ahead)
      .map(quantizeFrameMs)
      .filter((t, i, arr) => arr.indexOf(t) === i);
    // Only batches that left the path are cancelled. This effect has NO abort
    // in its cleanup on purpose: the cleanup runs on every playhead step, and
    // a batch must be allowed to outlive the tick that sent it.
    dropStaleRequests(inflight, new Set(times.map((t) => frameKey(t, windowS, metric))), store);
    const missing = times.filter((t) => !store.has(frameKey(t, windowS, metric)));
    if (missing.length === 0) return;
    // Batch the lookahead: at steady state playback creates exactly one new
    // missing frame per tick, and fetching it immediately meant one request
    // per second (measured). Defer until three frames of debt accumulate —
    // UNLESS one of the next two frames is missing (the needle must never
    // starve: first play, post-skip, post-scrub all hit this path).
    const urgent = missing.includes(times[0]) || (times.length > 1 && missing.includes(times[1]));
    if (!urgent && missing.length < 3) return;
    if (Date.now() < backoffRef.current.until) return; // the retry timer re-runs this effect
    const req: FrameRequest = { keys: missing.map((t) => frameKey(t, windowS, metric)), controller: new AbortController() };
    for (const k of req.keys) store.markPending(k);
    inflight.add(req);
    // A request that never answers would keep its frames "pending" for good.
    let failed = false;
    const timeout = setTimeout(() => {
      failed = true;
      req.controller.abort();
    }, FRAME_REQUEST_TIMEOUT_MS);
    fetch(`/api/frames?at=${missing.join(",")}&window=${windowS}&metric=${metric}`, { signal: req.controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`frames ${r.status}`);
        return r.json();
      })
      .then((body: { frames: Record<string, FrameData> }) => {
        missing.forEach((t, i) => store.set(req.keys[i], body.frames[String(t)] ?? {}));
        backoffRef.current = { failures: 0, until: 0 };
        bumpVersion();
      })
      .catch(() => {
        // Free the markers so the frames can be asked for again.
        for (const k of req.keys) store.clearPending(k);
        // A batch we cancelled ourselves (the playhead left it) is not a
        // failure. A real one — network, non-2xx, timeout — backs off.
        if (req.controller.signal.aborted && !failed) return;
        const failures = backoffRef.current.failures + 1;
        const delay = retryDelayMs(failures);
        backoffRef.current = { failures, until: Date.now() + delay };
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(bumpRetry, delay);
      })
      .finally(() => {
        clearTimeout(timeout);
        inflight.delete(req);
      });
  }, [cursor, stepMs, segments, playing, metric, hasOverride, retryTick]);
  useEffect(() => {
    const store = storeRef.current;
    const inflight = inflightRef.current;
    return () => {
      dropStaleRequests(inflight, new Set(), store);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  // A frame holds the clock while it is being fetched, or while it is missing
  // and a retry is scheduled. One nobody asked for must not: stepping onto it
  // is what triggers its fetch.
  useEffect(() => {
    if (!frameLoadingRef) return;
    const store = storeRef.current;
    const windowS = frameWindowS(stepMs);
    frameLoadingRef.current = hasOverride
      ? null
      : (tMs) => {
          const key = frameKey(tMs, windowS, metric);
          return store.isPending(key) || (!store.has(key) && Date.now() < backoffRef.current.until);
        };
    return () => {
      frameLoadingRef.current = null;
    };
  }, [frameLoadingRef, stepMs, metric, hasOverride]);

  // --- apply the current frame to the marker elements ---
  useEffect(() => {
    void version; // re-apply whenever new data lands
    if (markersRef.current.size === 0) return;
    // Circles are drawn at a real-world radius, so their pixel size depends on
    // where and how far in the map currently is.
    const mPerPx = map ? metersPerPixel(map.getCenter().lat, map.getZoom()) : metersPerPixel(38, 11.3);
    // Σύνοψη: the aggregate IS the frame; settle onto it and leave the
    // moment's frame (and the next apply's tween) untouched.
    if (overrideFrame != null) {
      lastAppliedRef.current = null;
      for (const [id, handle] of markersRef.current) {
        const v = overrideFrame[id];
        lastLevelsRef.current.set(id, v ? v.laeq : null);
        applyValue(handle, v ? v.laeq : null, 500, zoomBucket >= LABEL_MIN_ZOOM, mPerPx, null, "ease");
      }
      return;
    }
    const isLive = cursorQ === "live";
    const frame = isLive ? liveFrameRef.current : storeRef.current.get(frameKey(cursorQ, frameWindowS(stepMs), metric));
    if (!isLive && frame === undefined) return; // not loaded yet: keep last shown state

    // A jump larger than ~1.5 steps (skip/scrub) snaps instead of tweening —
    // a 950ms tween across a week-long jump would read as fake data motion.
    const prev = lastAppliedRef.current;
    const jumped =
      prev == null || prev === "live" !== isLive || (typeof prev === "number" && !isLive && Math.abs(cursorQ - prev) > stepMs * 1.5);
    const tween = jumped
      ? playing
        ? SKIP_TWEEN_MS // the held jump: travel to the landing frame
        : 0 // scrub: land instantly
      : isLive
        ? LIVE_TWEEN_MS
        : playing
          ? PLAYBACK_TWEEN_MS
          : PAUSED_TWEEN_MS;
    const timing: "linear" | "ease" = jumped && playing ? "ease" : isLive || playing ? "linear" : "ease";
    lastAppliedRef.current = cursorQ;

    const labelsOn = zoomBucket >= LABEL_MIN_ZOOM;
    for (const [id, handle] of markersRef.current) {
      const v = frame?.[id];
      lastLevelsRef.current.set(id, v ? v.laeq : null);
      applyValue(handle, v ? v.laeq : null, tween, labelsOn, mPerPx, usual?.[id], timing);
    }
    onFrameRef.current?.(frame ?? null);
  }, [cursorQ, stepMs, version, zoomBucket, playing, metric, map, usual, overrideFrame]);

  return null;
}

// The shell re-renders every second (wall clock); markers only care about
// real input changes.
export default memo(SensorLayer);
