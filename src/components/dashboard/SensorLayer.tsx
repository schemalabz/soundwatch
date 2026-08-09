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

import { useEffect, useReducer, useRef, useState } from "react";
import type mapboxgl from "mapbox-gl";
import {
  FrameStore,
  frameKey,
  frameWindowS,
  quantizeFrameMs,
  upcomingFrameTimes,
  type FrameData,
} from "@/lib/dashboard/frames";
import { levelColor, levelScale, paletteStops } from "@/lib/dashboard/levels";
import type { TimeSegment } from "@/lib/dashboard/filters";

interface SensorMeta {
  id: string;
  name: string | null;
  latitude: number;
  longitude: number;
}

export interface SensorLayerProps {
  map: mapboxgl.Map | null;
  cursor: number | "live";
  stepMs: number;
  segments: TimeSegment[];
  playing: boolean;
  onSensorClick?: (sensorId: string) => void;
}

const MARKER_PX = 30;
const PREFETCH_AHEAD = 6;
const LIVE_POLL_MS = 5000;
const LIVE_STALE_MS = 3 * 60_000;
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
}

// The label needs BOTH a close-enough zoom (city scale, not the whole
// basin) and a ring wide enough to frame two digits.
const LABEL_MIN_ZOOM = 12.2;
const LABEL_MIN_SCALE = 0.62;

function makeMarkerElement(): { root: HTMLDivElement; circle: HTMLSpanElement; label: HTMLSpanElement } {
  const root = document.createElement("div");
  // NO inline `position`: mapbox's .mapboxgl-marker class positions the root
  // absolutely and drives it via transform — an inline position:relative
  // overrides that class and drops markers into normal flow (they stack
  // downward off-map). The root still anchors the label: absolutely
  // positioned elements are containing blocks for absolute children.
  root.style.cssText = `width:${MARKER_PX}px;height:${MARKER_PX}px;display:grid;place-items:center;pointer-events:auto;cursor:pointer;`;
  const circle = document.createElement("span");
  circle.style.cssText = [
    `width:${MARKER_PX}px`,
    `height:${MARKER_PX}px`,
    "border-radius:9999px",
    "border:1.5px solid rgba(191,192,192,0.55)", // silver — the no-data state
    "transform:scale(0.35)",
    "opacity:0.6",
    "will-change:transform,opacity",
    `transition:transform ${PLAYBACK_TWEEN_MS}ms linear,border-color ${PLAYBACK_TWEEN_MS}ms linear,opacity 400ms linear`,
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
  root.appendChild(circle);
  root.appendChild(label);
  return { root, circle, label };
}

/** Apply one sensor's frame value to its circle. null = no data (gray). */
function applyValue(
  h: Pick<MarkerHandle, "circle" | "label">,
  laeq: number | null,
  tweenMs: number,
  labelsOn: boolean,
  timing: "linear" | "ease" = "linear"
): void {
  const fn = timing === "linear" ? "linear" : "cubic-bezier(0.25,0,0.2,1)";
  h.circle.style.transitionDuration = `${tweenMs}ms,${tweenMs}ms,400ms`;
  h.circle.style.transitionTimingFunction = `${fn},${fn},linear`;
  h.label.style.transitionDuration = `${tweenMs}ms,300ms`;
  if (laeq == null) {
    h.circle.style.borderColor = "rgba(191,192,192,0.55)";
    h.circle.style.transform = "scale(0.35)";
    h.circle.style.opacity = "0.6";
    h.label.style.opacity = "0";
  } else {
    const stops = paletteStops();
    const scale = levelScale(laeq, stops);
    const color = levelColor(laeq, stops);
    h.circle.style.borderColor = color;
    h.circle.style.transform = `scale(${scale.toFixed(3)})`;
    h.circle.style.opacity = "1";
    // Show the value only when zoomed in enough AND the ring can frame it.
    if (labelsOn && scale >= LABEL_MIN_SCALE) {
      h.label.textContent = String(Math.round(laeq));
      h.label.style.color = color;
      h.label.style.opacity = "1";
    } else {
      h.label.style.opacity = "0";
    }
  }
}

export default function SensorLayer({ map, cursor, stepMs, segments, playing, onSensorClick }: SensorLayerProps) {
  const [sensors, setSensors] = useState<SensorMeta[]>([]);
  const [version, bumpVersion] = useReducer((v: number) => v + 1, 0);
  const [zoomBucket, setZoomBucket] = useState(0);
  const storeRef = useRef(new FrameStore());
  const markersRef = useRef(new Map<string, MarkerHandle>());
  const liveFrameRef = useRef<FrameData>({});
  const lastAppliedRef = useRef<number | "live" | null>(null);
  const onSensorClickRef = useRef(onSensorClick);
  useEffect(() => {
    onSensorClickRef.current = onSensorClick;
  }, [onSensorClick]);

  // --- zoom tracking (quantized to 0.25 so label toggling is cheap) ---
  useEffect(() => {
    if (!map) return;
    const update = () => setZoomBucket(Math.round(map.getZoom() * 4) / 4);
    update();
    map.on("zoom", update);
    return () => {
      map.off("zoom", update);
    };
  }, [map]);

  // --- sensor metadata (once) ---
  useEffect(() => {
    let cancelled = false;
    fetch("/api/sensors", { cache: "no-store" })
      .then((r) => r.json())
      .then((list: { id: string; name: string | null; latitude: number | null; longitude: number | null }[]) => {
        if (cancelled) return;
        setSensors(
          list
            .filter((s) => s.latitude != null && s.longitude != null)
            .map((s) => ({ id: s.id, name: s.name, latitude: s.latitude!, longitude: s.longitude! }))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // --- markers lifecycle ---
  useEffect(() => {
    if (!map || sensors.length === 0) return;
    const markers = markersRef.current;
    let disposed = false;
    let handles: MarkerHandle[] = [];
    // mapbox-gl is loaded dynamically alongside MapCanvas; import for Marker.
    import("mapbox-gl").then(({ default: gl }) => {
      if (disposed) return;
      for (const s of sensors) {
        const { root, circle, label } = makeMarkerElement();
        root.addEventListener("click", (e) => {
          e.stopPropagation();
          onSensorClickRef.current?.(s.id);
        });
        const marker = new gl.Marker({ element: root, anchor: "center" })
          .setLngLat([s.longitude, s.latitude])
          .addTo(map);
        const handle = { marker, circle, label };
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
  }, [map, sensors]);

  // --- live frame polling (only while the playhead is live) ---
  useEffect(() => {
    if (cursor !== "live") return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/sensors", { cache: "no-store" });
        const list: {
          id: string;
          latestReading: { recordedAt: string; noiseDba: number | null } | null;
        }[] = await res.json();
        if (cancelled) return;
        const frame: FrameData = {};
        const staleBefore = Date.now() - LIVE_STALE_MS;
        for (const s of list) {
          const r = s.latestReading;
          if (r?.noiseDba != null && new Date(r.recordedAt).getTime() > staleBefore) {
            frame[s.id] = { laeq: r.noiseDba, n: 1 };
          }
        }
        liveFrameRef.current = frame;
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
  }, [cursor]);

  // --- prefetcher: current frame + the playback path ahead, one batch ---
  const cursorQ = cursor === "live" ? "live" : quantizeFrameMs(cursor);
  useEffect(() => {
    if (cursorQ === "live") return;
    const windowS = frameWindowS(stepMs);
    const ahead = playing ? PREFETCH_AHEAD : 2;
    const times = upcomingFrameTimes(segments, cursorQ, stepMs, ahead)
      .map(quantizeFrameMs)
      .filter((t, i, arr) => arr.indexOf(t) === i);
    const missing = times.filter((t) => !storeRef.current.has(frameKey(t, windowS)));
    if (missing.length === 0) return;
    for (const t of missing) storeRef.current.markPending(frameKey(t, windowS));
    const controller = new AbortController();
    fetch(`/api/frames?at=${missing.join(",")}&window=${windowS}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((body: { frames: Record<string, FrameData> }) => {
        for (const t of missing) {
          storeRef.current.set(frameKey(t, windowS), body.frames[String(t)] ?? {});
        }
        bumpVersion();
      })
      .catch(() => {
        for (const t of missing) storeRef.current.clearPending(frameKey(t, windowS));
      });
    return () => controller.abort();
  }, [cursorQ, stepMs, segments, playing]);

  // --- apply the current frame to the marker elements ---
  useEffect(() => {
    void version; // re-apply whenever new data lands
    if (markersRef.current.size === 0) return;
    const isLive = cursorQ === "live";
    const frame = isLive ? liveFrameRef.current : storeRef.current.get(frameKey(cursorQ, frameWindowS(stepMs)));
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
      applyValue(handle, v ? v.laeq : null, tween, labelsOn, timing);
    }
  }, [cursorQ, stepMs, version, zoomBucket, playing]);

  return null;
}
