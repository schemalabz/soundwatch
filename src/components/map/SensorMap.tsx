"use client";

import { createElement, useEffect, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FaVolumeHigh, FaWind, FaSun } from "react-icons/fa6";
import type { IconType } from "react-icons";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  ATHENS_CENTER, ATHENS_LOCK_ZOOM, ATTICA_BOUNDS,
  NOISE_HEAT_COLORS, AIR_HEAT_COLORS, NOISE_WEIGHT_RANGE, AIR_WEIGHT_RANGE,
  getNoiseLevelColor,
} from "@/lib/geo";

// Popup header colour still reflects online/offline status.
const STATUS_ONLINE = "#4caf7d";
const STATUS_OFFLINE = "#4f5d75";

// Sensors outside the search radius render greyed-out ("disabled").
const DISABLED_COLOR = "#7c828f";

// Per-layer marker glyph + a value->level colour (matches the map legend).
const LAYER_ICON: Record<"noise" | "air" | "uv", IconType> = {
  noise: FaVolumeHigh,
  air: FaWind,
  uv: FaSun,
};
function levelColor(layer: "noise" | "air" | "uv", lr: Record<string, unknown> | null): string {
  if (layer === "air") {
    const v = (lr?.pm25 as number | undefined) ?? 0;
    return v < 12 ? "#4a90d9" : v < 35 ? "#6a52c4" : "#6b1e8f";
  }
  if (layer === "uv") {
    const v = (lr?.uvIndex as number | undefined) ?? 0;
    return v < 0.12 ? "#9fd0a8" : v < 0.2 ? "#e5c95a" : "#c94fb0";
  }
  return getNoiseLevelColor((lr?.noiseDba as number | undefined) ?? 0);
}

// Localised relative time ("5 months ago") for the popup.
function relativeTime(iso: string, lang: string): string {
  const diffSec = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000], ["month", 2592000], ["week", 604800],
    ["day", 86400], ["hour", 3600], ["minute", 60],
  ];
  for (const [unit, secs] of units) {
    if (abs >= secs) return rtf.format(Math.round(diffSec / secs), unit);
  }
  return rtf.format(diffSec, "second");
}
import athensBorder from "@/lib/athensBorder.json";

interface SensorData {
  id: string;
  deviceId: string;
  name: string | null;
  address?: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive?: boolean | null;
  lastSeenAt?: string | null;
  latestReading: Record<string, unknown> | null;
}

export interface MapBounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface MapLayers {
  noise: boolean;
  air: boolean;
  uv: boolean;
}

interface SensorMapProps {
  sensors: SensorData[];
  selectedSensorId?: string | null;
  layers?: MapLayers;
  radiusCenter?: { lng: number; lat: number } | null;
  radiusKm?: number;
  fitToken?: number;
  onSensorClick: (sensor: SensorData) => void;
  onBoundsChange?: (bounds: MapBounds) => void;
  onClose?: () => void; // popup/selection dismissed
}

const SOURCE = "sensors-src";
const NOISE_LAYER = "noise-heat";
const AIR_LAYER = "air-heat";
const UV_LAYER = "uv-circle";
const RADIUS_SOURCE = "radius-src";
const RADIUS_FILL = "radius-fill";
const RADIUS_LINE = "radius-line";
const BORDER_SOURCE = "athens-border";
const BORDER_FILL = "athens-border-fill";
const BORDER_LINE = "athens-border-line";

const heatColor = (stops: [number, string][]): mapboxgl.Expression => [
  "interpolate", ["linear"], ["heatmap-density"],
  ...stops.flatMap(([o, c]) => [o, c]),
];

function circleRing(lng: number, lat: number, km: number, pts = 72): number[][] {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  const ring: number[][] = [];
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return ring;
}

export default function SensorMap({
  sensors,
  selectedSensorId,
  layers = { noise: true, air: false, uv: false },
  radiusCenter = null,
  radiusKm = 5,
  fitToken = 0,
  onSensorClick,
  onBoundsChange,
  onClose,
}: SensorMapProps) {
  // The single active layer drives the marker glyph (circle / wind / sun).
  const activeLayer: "noise" | "air" | "uv" = layers.air
    ? "air"
    : layers.uv
      ? "uv"
      : "noise";
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const prevSelectedRef = useRef<string | null | undefined>(undefined);
  const onSensorClickRef = useRef(onSensorClick);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const onCloseRef = useRef(onClose);
  const sensorsRef = useRef(sensors);
  const layersRef = useRef(layers);
  const radiusRef = useRef({ center: radiusCenter, km: radiusKm });
  useEffect(() => {
    onSensorClickRef.current = onSensorClick;
    onBoundsChangeRef.current = onBoundsChange;
    onCloseRef.current = onClose;
  }, [onSensorClick, onBoundsChange, onClose]);
  useEffect(() => {
    sensorsRef.current = sensors;
  }, [sensors]);

  function ensureLayers() {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;

    const feats = sensorsRef.current
      .filter((s) => s.latitude != null && s.longitude != null)
      .map((s) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [s.longitude!, s.latitude!] },
        properties: {
          noise: (s.latestReading?.noiseDba as number | undefined) ?? 45,
          // normalized historical peak (0..1) drives how far the noise spreads
          spread: (s.latestReading?.noiseSpread as number | undefined) ?? 0.5,
          pm25: (s.latestReading?.pm25 as number | undefined) ?? 5,
          uv: (s.latestReading?.uvIndex as number | undefined) ?? 0,
        },
      }))
      .sort((a, b) => a.properties.uv - b.properties.uv); // highest UV on top

    const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: feats };
    const src = m.getSource(SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(data);
    else m.addSource(SOURCE, { type: "geojson", data });

    // --- Noise: mapbox heatmap; radius scales with each sensor's historical peak.
    if (!m.getLayer(NOISE_LAYER)) {
      m.addLayer({
        id: NOISE_LAYER, type: "heatmap", source: SOURCE,
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "noise"], NOISE_WEIGHT_RANGE[0], 0, NOISE_WEIGHT_RANGE[1], 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 9, 1, 15, 3],
          "heatmap-radius": [
            "interpolate", ["linear"], ["zoom"],
            9, ["interpolate", ["linear"], ["get", "spread"], 0, 12, 1, 42],
            15, ["interpolate", ["linear"], ["get", "spread"], 0, 26, 1, 100],
          ],
          "heatmap-opacity": 0.85,
          "heatmap-color": heatColor(NOISE_HEAT_COLORS),
        },
      });
    }
    if (!m.getLayer(AIR_LAYER)) {
      m.addLayer({
        id: AIR_LAYER, type: "heatmap", source: SOURCE,
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "pm25"], AIR_WEIGHT_RANGE[0], 0, AIR_WEIGHT_RANGE[1], 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 9, 1, 15, 3],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 9, 22, 15, 55],
          "heatmap-opacity": 0.8,
          "heatmap-color": heatColor(AIR_HEAT_COLORS),
        },
      });
    }
    if (!m.getLayer(UV_LAYER)) {
      m.addLayer({
        id: UV_LAYER, type: "circle", source: SOURCE,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "uv"], 0, 4, 0.4, 18],
          "circle-color": ["interpolate", ["linear"], ["get", "uv"],
            0, "#9fd0a8", 0.12, "#e5c95a", 0.2, "#e8933a", 0.4, "#c94fb0"],
          "circle-opacity": 0.85,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "rgba(255,255,255,0.7)",
        },
      });
    }

    ensureBorder();
    ensureRadius();
    applyVisibility();
  }

  // The Athens municipality outline (Δήμος Αθηναίων), always shown, above the heatmaps.
  function ensureBorder() {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    if (!m.getSource(BORDER_SOURCE)) {
      m.addSource(BORDER_SOURCE, { type: "geojson", data: athensBorder as GeoJSON.Feature });
    }
    if (!m.getLayer(BORDER_FILL)) {
      m.addLayer({
        id: BORDER_FILL, type: "fill", source: BORDER_SOURCE,
        paint: { "fill-color": "#5b8def", "fill-opacity": 0.05 },
      });
    }
    if (!m.getLayer(BORDER_LINE)) {
      m.addLayer({
        id: BORDER_LINE, type: "line", source: BORDER_SOURCE,
        paint: { "line-color": "#5b8def", "line-width": 3, "line-opacity": 0.95 },
      });
    }
  }

  function applyVisibility() {
    const m = map.current;
    if (!m) return;
    const set = (id: string, on: boolean) =>
      m.getLayer(id) && m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    set(NOISE_LAYER, layersRef.current.noise);
    set(AIR_LAYER, layersRef.current.air);
    set(UV_LAYER, layersRef.current.uv);
  }

  // The "active radius" grid: a dashed circle + faint fill around the search center.
  function ensureRadius() {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    const { center, km } = radiusRef.current;
    if (!center) return;
    const data: GeoJSON.Feature = {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [circleRing(center.lng, center.lat, km)] },
      properties: {},
    };
    const src = m.getSource(RADIUS_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(data);
    else m.addSource(RADIUS_SOURCE, { type: "geojson", data });
    if (!m.getLayer(RADIUS_FILL)) {
      m.addLayer({
        id: RADIUS_FILL, type: "fill", source: RADIUS_SOURCE,
        paint: { "fill-color": "#ff0000", "fill-opacity": 0.15 },
      });
    }
    if (!m.getLayer(RADIUS_LINE)) {
      m.addLayer({
        id: RADIUS_LINE, type: "line", source: RADIUS_SOURCE,
        paint: {
          "line-color": "#ff0000", "line-width": 4, "line-opacity": 1,
        },
      });
    }
    // eslint-disable-next-line no-console
    console.log("[radius] ensureRadius drew", { center, km, hasLine: !!m.getLayer(RADIUS_LINE) });
  }

  useEffect(() => {
    if (!mapContainer.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      console.warn("Mapbox token not set");
      return;
    }

    const styleFor = (theme: string | null) =>
      theme === "light"
        ? "mapbox://styles/mapbox/light-v11"
        : "mapbox://styles/mapbox/dark-v11";

    mapboxgl.accessToken = token;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: styleFor(document.documentElement.getAttribute("data-theme")),
      center: [ATHENS_CENTER.lng, ATHENS_CENTER.lat],
      zoom: ATHENS_LOCK_ZOOM,
      minZoom: ATHENS_LOCK_ZOOM, // locked: can't zoom out below the Athens view
      maxBounds: ATTICA_BOUNDS,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    // No rotation ever.
    map.current.dragRotate.disable();
    map.current.touchZoomRotate.disableRotation();
    // Panning is locked at the base zoom (11) and unlocked once the user zooms in.
    const updatePan = () => {
      const m = map.current;
      if (!m) return;
      if (m.getZoom() > ATHENS_LOCK_ZOOM + 0.01) {
        m.dragPan.enable();
        m.keyboard.enable();
      } else {
        m.dragPan.disable();
        m.keyboard.disable();
      }
    };
    map.current.on("zoom", updatePan);
    updatePan();

    const themeObserver = new MutationObserver(() => {
      map.current?.setStyle(
        styleFor(document.documentElement.getAttribute("data-theme"))
      );
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const emitBounds = () => {
      const b = map.current?.getBounds();
      if (b) {
        onBoundsChangeRef.current?.({
          minLng: b.getWest(), minLat: b.getSouth(),
          maxLng: b.getEast(), maxLat: b.getNorth(),
        });
      }
    };
    map.current.on("load", emitBounds);
    map.current.on("moveend", emitBounds);

    map.current.on("load", ensureLayers);
    map.current.on("style.load", ensureLayers);

    return () => {
      themeObserver.disconnect();
      map.current?.remove();
    };
  }, []);

  // Rebuild neutral click markers + refresh layer data when the sensor set changes.
  useEffect(() => {
    if (!map.current) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();

    const insideRadius = (lng: number | null, lat: number | null) => {
      if (lng == null || lat == null) return false;
      if (!radiusCenter) return true;
      const dLat = (lat - radiusCenter.lat) * 111;
      const dLng = (lng - radiusCenter.lng) * 111 * Math.cos((radiusCenter.lat * Math.PI) / 180);
      return Math.hypot(dLat, dLng) <= radiusKm;
    };

    for (const sensor of sensors) {
      if (sensor.latitude == null || sensor.longitude == null) continue;

      const el = document.createElement("div");
      el.style.cursor = "pointer";

      // Colour by the value's level (low/moderate/high); sensors outside the
      // active radius are greyed out. UV shows the bare sun icon; noise & air
      // wrap the icon in a coloured circle.
      const inside = insideRadius(sensor.longitude, sensor.latitude);
      const color = inside ? levelColor(activeLayer, sensor.latestReading) : DISABLED_COLOR;
      const Icon = LAYER_ICON[activeLayer];
      const pin = document.createElement("div");
      pin.dataset.sensorId = sensor.id;
      pin.style.transition = "transform 0.2s";
      pin.style.transformOrigin = "center";
      if (activeLayer === "uv") {
        pin.style.lineHeight = "0";
        pin.style.filter =
          "drop-shadow(0 0 1px rgba(255,255,255,0.9)) drop-shadow(0 1px 2px rgba(0,0,0,0.55))";
        pin.innerHTML = renderToStaticMarkup(createElement(Icon, { size: 22, color }));
      } else {
        pin.style.width = "26px";
        pin.style.height = "26px";
        pin.style.borderRadius = "50%";
        pin.style.background = color;
        pin.style.border = "2px solid #ffffff";
        pin.style.boxShadow = "0 1px 4px rgba(0,0,0,0.45)";
        pin.style.display = "flex";
        pin.style.alignItems = "center";
        pin.style.justifyContent = "center";
        pin.innerHTML = renderToStaticMarkup(
          createElement(Icon, { size: 13, color: "#ffffff" })
        );
      }
      el.appendChild(pin);

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        map.current?.flyTo({
          center: [sensor.longitude!, sensor.latitude!],
          zoom: Math.max(map.current.getZoom(), 14),
          duration: 500,
        });
        onSensorClickRef.current(sensor);
      });

      const marker = new mapboxgl.Marker(el)
        .setLngLat([sensor.longitude, sensor.latitude])
        .addTo(map.current!);
      markersRef.current.set(sensor.id, marker);
    }

    ensureLayers();
  }, [sensors, activeLayer, radiusCenter, radiusKm]);

  // Apply layer visibility when the pills change.
  useEffect(() => {
    layersRef.current = layers;
    applyVisibility();
  }, [layers]);

  // Redraw the radius grid when the center/radius changes.
  useEffect(() => {
    radiusRef.current = { center: radiusCenter, km: radiusKm };
    ensureRadius();
  }, [radiusCenter, radiusKm]);

  // Fit the map to the active radius when asked (address search / radius change).
  useEffect(() => {
    const m = map.current;
    if (!m || fitToken === 0 || !radiusCenter) return;
    const dLat = radiusKm / 111;
    const dLng = radiusKm / (111 * Math.cos((radiusCenter.lat * Math.PI) / 180));
    m.fitBounds(
      [
        [radiusCenter.lng - dLng, radiusCenter.lat - dLat],
        [radiusCenter.lng + dLng, radiusCenter.lat + dLat],
      ],
      { padding: 48, duration: 600 }
    );
  }, [fitToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Highlight selected marker + zoom out on deselect.
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const dot = marker.getElement().querySelector("[data-sensor-id]") as HTMLElement | null;
      if (!dot) return;
      dot.style.transform = id === selectedSensorId ? "scale(1.6)" : "scale(1)";
    });
    if (!selectedSensorId && prevSelectedRef.current && map.current) {
      map.current.flyTo({
        center: [ATHENS_CENTER.lng, ATHENS_CENTER.lat],
        zoom: ATHENS_LOCK_ZOOM,
        duration: 500,
      });
    }
    prevSelectedRef.current = selectedSensorId;
  }, [selectedSensorId]);

  // Tooltip popup for the selected sensor: noise / air quality / UV.
  useEffect(() => {
    const m = map.current;
    if (!m || !selectedSensorId) return;
    const s = sensors.find((x) => x.id === selectedSensorId);
    if (!s || s.latitude == null || s.longitude == null) return;
    const lr = s.latestReading ?? {};
    const fmt = (v: unknown, d = 1) => (typeof v === "number" ? v.toFixed(d) : "—");
    const online = s.isActive !== false;
    const status = online ? STATUS_ONLINE : STATUS_OFFLINE;
    const lang = document.documentElement.lang === "el" ? "el" : "en";
    const L =
      lang === "el"
        ? { noise: "Θόρυβος", air: "Ποιότητα αέρα", uv: "Ακτίνες UV",
            online: "ONLINE", offline: "OFFLINE", outdoor: "ΕΞΩΤΕΡΙΚΟΣ", unknown: "Άγνωστο" }
        : { noise: "Noise", air: "Air quality", uv: "UV",
            online: "ONLINE", offline: "OFFLINE", outdoor: "OUTDOOR", unknown: "Unknown" };
    const when = s.lastSeenAt ? relativeTime(s.lastSeenAt, lang) : "";

    const clock =
      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
      `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
      `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
    const metric = (label: string, val: string) =>
      `<div style="display:flex;justify-content:space-between;gap:16px">` +
      `<span style="color:var(--sw-muted)">${label}</span><b>${val}</b></div>`;
    const pill = (bg: string, color: string, text: string) =>
      `<span style="background:${bg};color:${color};font-size:10.5px;font-weight:700;` +
      `letter-spacing:.5px;padding:4px 10px;border-radius:999px">${text}</span>`;

    const html =
      `<div style="width:250px;border-radius:14px;overflow:hidden;` +
      `font-family:var(--font-open-sans),system-ui,sans-serif;` +
      `box-shadow:0 10px 30px rgba(0,0,0,.35)">` +
        // status-coloured header
        `<div style="background:${status};color:#fff;padding:14px 16px 12px">` +
          `<div style="font-weight:800;font-size:19px;letter-spacing:.3px">${(s.deviceId ?? s.id).toUpperCase()}</div>` +
          `<div style="font-size:14px;opacity:.92;margin-top:1px">${s.name ?? L.unknown}</div>` +
          `<div style="display:flex;align-items:center;gap:6px;font-size:12px;opacity:.9;margin-top:8px">${clock}<span>${when}</span></div>` +
        `</div>` +
        // body: address + metrics + pills
        `<div style="background:var(--sw-panel);color:var(--sw-ink);padding:12px 16px 14px">` +
          `<div style="display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600">` +
            `<span style="width:12px;height:12px;border-radius:50%;background:${status};flex:0 0 auto"></span>` +
            `<span>${s.address ?? s.name ?? s.id}</span>` +
          `</div>` +
          `<div style="margin-top:11px;display:flex;flex-direction:column;gap:5px;font-size:13px">` +
            metric(L.noise, `${fmt(lr.noiseDba)} dBA`) +
            metric(L.air, `${fmt(lr.pm25)} µg/m³`) +
            metric(L.uv, `${fmt(lr.uvIndex, 2)}`) +
          `</div>` +
          `<div style="display:flex;gap:8px;margin-top:12px">` +
            pill(status, "#fff", online ? L.online : L.offline) +
            pill("var(--sw-badge-bg)", "var(--sw-muted)", L.outdoor) +
          `</div>` +
        `</div>` +
      `</div>`;

    let programmatic = false;
    const popup = new mapboxgl.Popup({
      offset: 14, closeButton: true, closeOnClick: false, maxWidth: "260px", className: "sw-popup",
    })
      .setLngLat([s.longitude, s.latitude])
      .setHTML(html)
      .addTo(m);
    popup.on("close", () => { if (!programmatic) onCloseRef.current?.(); });
    popupRef.current = popup;
    return () => {
      programmatic = true; // don't fire onClose when we remove it ourselves
      popup.remove();
      popupRef.current = null;
    };
  }, [selectedSensorId, sensors]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
