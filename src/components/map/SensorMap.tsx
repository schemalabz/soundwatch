"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { ATHENS_CENTER, ATHENS_ZOOM, getNoiseLevelColor } from "@/lib/geo";

interface SensorData {
  id: string;
  deviceId: string;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  latestReading: Record<string, unknown> | null;
}

export interface MapBounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

interface SensorMapProps {
  sensors: SensorData[];
  selectedSensorId?: string | null;
  heatmap?: boolean;
  onSensorClick: (sensor: SensorData) => void;
  onBoundsChange?: (bounds: MapBounds) => void;
}

const HEAT_SOURCE = "sensor-heat";
const HEAT_LAYER = "sensor-heat-layer";

export default function SensorMap({
  sensors,
  selectedSensorId,
  heatmap = false,
  onSensorClick,
  onBoundsChange,
}: SensorMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const prevSelectedRef = useRef<string | null | undefined>(undefined);
  const onSensorClickRef = useRef(onSensorClick);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const sensorsRef = useRef(sensors);
  const heatmapRef = useRef(heatmap);
  useEffect(() => {
    onSensorClickRef.current = onSensorClick;
    onBoundsChangeRef.current = onBoundsChange;
  }, [onSensorClick, onBoundsChange]);
  useEffect(() => {
    sensorsRef.current = sensors;
  }, [sensors]);

  // Build the heatmap source/layer (idempotent) and apply current visibility.
  function ensureHeatmap() {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;

    const data: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: sensorsRef.current
        .filter((s) => s.latitude != null && s.longitude != null)
        .map((s) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [s.longitude!, s.latitude!] },
          properties: {
            weight: (s.latestReading?.noiseDba as number | undefined) ?? 45,
          },
        })),
    };

    const src = m.getSource(HEAT_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (src) {
      src.setData(data);
    } else {
      m.addSource(HEAT_SOURCE, { type: "geojson", data });
    }

    if (!m.getLayer(HEAT_LAYER)) {
      m.addLayer({
        id: HEAT_LAYER,
        type: "heatmap",
        source: HEAT_SOURCE,
        paint: {
          // dBA → weight (quiet ~40 → 0, very loud ~90 → 1)
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            40, 0,
            90, 1,
          ],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 9, 1, 15, 3],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 9, 22, 15, 55],
          "heatmap-opacity": 0.85,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0, "rgba(0,0,0,0)",
            0.15, "#5ba834",
            0.4, "#c7c43c",
            0.6, "#e8b335",
            0.8, "#ec832c",
            1, "#d6342a",
          ],
        },
      });
    }

    m.setLayoutProperty(
      HEAT_LAYER,
      "visibility",
      heatmapRef.current ? "visible" : "none"
    );
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
      zoom: ATHENS_ZOOM,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Swap the basemap when the user toggles light/dark. HTML markers persist.
    const themeObserver = new MutationObserver(() => {
      map.current?.setStyle(
        styleFor(document.documentElement.getAttribute("data-theme"))
      );
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    // Report the visible bounds on load and after each pan/zoom, so the parent
    // can query sensors in the viewport via the PostGIS bbox endpoint.
    const emitBounds = () => {
      const b = map.current?.getBounds();
      if (b) {
        onBoundsChangeRef.current?.({
          minLng: b.getWest(),
          minLat: b.getSouth(),
          maxLng: b.getEast(),
          maxLat: b.getNorth(),
        });
      }
    };
    map.current.on("load", emitBounds);
    map.current.on("moveend", emitBounds);

    // (Re)build the heatmap on first load and after every basemap style swap.
    map.current.on("load", ensureHeatmap);
    map.current.on("style.load", ensureHeatmap);

    return () => {
      themeObserver.disconnect();
      map.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();

    for (const sensor of sensors) {
      if (sensor.latitude == null || sensor.longitude == null) continue;

      const dba = sensor.latestReading?.noiseDba as number | null;
      const color = dba != null ? getNoiseLevelColor(dba) : "#a8a29e";

      const el = document.createElement("div");
      el.style.cursor = "pointer";
      el.style.display = heatmapRef.current ? "none" : "";

      const dot = document.createElement("div");
      dot.style.width = "18px";
      dot.style.height = "18px";
      dot.style.borderRadius = "50%";
      dot.style.backgroundColor = color;
      dot.style.border = "2.5px solid var(--sw-panel)";
      dot.style.boxShadow = "0 0 0 1px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.4)";
      dot.style.transition = "transform 0.2s";
      dot.dataset.sensorId = sensor.id;
      el.appendChild(dot);

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

    // Keep the heatmap data in sync with the sensor set.
    ensureHeatmap();
  }, [sensors]);

  // Toggle between markers and heatmap.
  useEffect(() => {
    heatmapRef.current = heatmap;
    const m = map.current;
    if (m && m.getLayer(HEAT_LAYER)) {
      m.setLayoutProperty(HEAT_LAYER, "visibility", heatmap ? "visible" : "none");
    }
    markersRef.current.forEach((marker) => {
      marker.getElement().style.display = heatmap ? "none" : "";
    });
  }, [heatmap]);

  // Highlight selected marker + zoom out on deselect
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const dot = marker.getElement().querySelector("[data-sensor-id]") as HTMLElement | null;
      if (!dot) return;
      if (id === selectedSensorId) {
        dot.style.transform = "scale(1.4)";
        dot.style.boxShadow = "0 2px 10px rgba(0,0,0,0.4)";
      } else {
        dot.style.transform = "scale(1)";
        dot.style.boxShadow = "0 2px 6px rgba(0,0,0,0.25)";
      }
    });

    // Zoom back out when deselected (but not on initial render)
    if (!selectedSensorId && prevSelectedRef.current && map.current) {
      map.current.flyTo({
        center: [ATHENS_CENTER.lng, ATHENS_CENTER.lat],
        zoom: ATHENS_ZOOM,
        duration: 500,
      });
    }
    prevSelectedRef.current = selectedSensorId;
  }, [selectedSensorId]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
