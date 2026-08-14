"use client";

// Location pins on the map: a sound-accent pin marker per chosen location
// with its radius drawn as a translucent GeoJSON disc (real meters — it
// scales with zoom, a DOM circle can't). Also owns placement mode: while
// armed, the map cursor is a crosshair and the next click drops a pin.
// Clicking an existing pin removes it.

import { useEffect, useRef } from "react";
import type mapboxgl from "mapbox-gl";
import type { GeoJSON } from "geojson";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";
import type { LocationPin } from "@/lib/dashboard/filters";

const SOURCE_ID = "sw-location-radii";
const FILL_LAYER = "sw-location-radii-fill";
const LINE_LAYER = "sw-location-radii-line";

/** A radiusM circle around (lng, lat) as a GeoJSON polygon (64 points). */
function circlePolygon(lng: number, lat: number, radiusM: number): GeoJSON.Feature {
  const dLat = radiusM / 110_574;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

function pinElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = "cursor:pointer;pointer-events:auto;filter:drop-shadow(0 1px 2px rgb(45 49 66/0.35));";
  el.title = tr.locations.remove;
  // lucide map-pin, filled with the sound accent.
  el.innerHTML =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="var(--sw-sound)" stroke="var(--sw-paper)" stroke-width="1.4">' +
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>' +
    '<circle cx="12" cy="10" r="3" fill="var(--sw-paper)" stroke="none"/></svg>';
  return el;
}

export default function LocationLayer({
  map,
  locations,
  placing,
  onPlace,
  onRemove,
}: {
  map: mapboxgl.Map | null;
  locations: readonly LocationPin[];
  placing: boolean;
  onPlace: (lng: number, lat: number) => void;
  onRemove: (index: number) => void;
}) {
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const placingRef = useRef(placing);
  const onPlaceRef = useRef(onPlace);
  const onRemoveRef = useRef(onRemove);
  useEffect(() => {
    placingRef.current = placing;
    onPlaceRef.current = onPlace;
    onRemoveRef.current = onRemove;
  }, [placing, onPlace, onRemove]);

  // Placement mode: crosshair + one persistent click handler reading refs.
  useEffect(() => {
    if (!map) return;
    const onClick = (e: mapboxgl.MapMouseEvent) => {
      if (!placingRef.current) return;
      onPlaceRef.current(e.lngLat.lng, e.lngLat.lat);
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    // getCanvas() is undefined once the map instance has been removed (HMR,
    // shell remount) — guard both edges of the effect.
    const setCursor = (c: string) => {
      const canvas = map.getCanvas?.();
      if (canvas) canvas.style.cursor = c;
    };
    setCursor(placing ? "crosshair" : "");
    return () => setCursor("");
  }, [map, placing]);

  // Pins + radius discs, rebuilt on every locations change (a handful of
  // features — simpler than diffing, and the style guard covers the map
  // still loading its style on first render).
  useEffect(() => {
    if (!map) return;
    let disposed = false;

    const apply = () => {
      if (disposed) return;
      const data: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: locations.map((p) => circlePolygon(p.lng, p.lat, p.radiusM)),
      };
      const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        source.setData(data);
      } else {
        map.addSource(SOURCE_ID, { type: "geojson", data });
        map.addLayer({
          id: FILL_LAYER,
          type: "fill",
          source: SOURCE_ID,
          paint: { "fill-color": "#ef8354", "fill-opacity": 0.08 },
        });
        map.addLayer({
          id: LINE_LAYER,
          type: "line",
          source: SOURCE_ID,
          paint: { "line-color": "#ef8354", "line-opacity": 0.55, "line-width": 1.5, "line-dasharray": [2, 2] },
        });
      }

      import("mapbox-gl").then(({ default: gl }) => {
        if (disposed) return;
        for (const m of markersRef.current) m.remove();
        markersRef.current = locations.map((p, i) => {
          const el = pinElement();
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            onRemoveRef.current(i);
          });
          return new gl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(map);
        });
      });
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);

    return () => {
      disposed = true;
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
    };
  }, [map, locations]);

  return null;
}
