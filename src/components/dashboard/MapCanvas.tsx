"use client";

// The map surface. Data layers come later — for now this owns the Mapbox
// lifecycle, a palette-matched light style, and a graceful tokenless
// fallback so the dashboard is workable on any checkout.

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const ATHENS_CENTER: [number, number] = [23.7315, 37.9755];
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

export default function MapCanvas({
  onReady,
}: {
  /** Fires with the live map instance (marker layers, canvas snapshots). */
  onReady?: (map: mapboxgl.Map | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: ATHENS_CENTER,
      zoom: 11.3,
      minZoom: 9,
      maxZoom: 17,
      dragRotate: false,
      // Lets SkipFlash snapshot the canvas outside a render frame.
      preserveDrawingBuffer: true,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.on("error", (e) => {
      // Bad/expired token etc. — fall back instead of a broken canvas.
      if (!map.isStyleLoaded()) setFailed(true);
      console.warn("Map error:", e.error?.message);
    });
    mapRef.current = map;
    onReady?.(map);

    return () => {
      onReady?.(null);
      map.remove();
      mapRef.current = null;
    };
  }, [onReady]);

  if (!TOKEN || failed) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-secondary">
        <div className="text-center max-w-xs px-6">
          <div className="text-sm font-medium">Ο χάρτης χρειάζεται κλειδί Mapbox</div>
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
            Ορίστε <code className="font-medium">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> στο{" "}
            <code className="font-medium">.env</code> και κάντε επανεκκίνηση.
          </p>
        </div>
      </div>
    );
  }

  // Two divs on purpose: mapbox-gl's stylesheet forces `position: relative`
  // on its container (overriding Tailwind's `absolute`), which collapsed the
  // map to 0 height. The OUTER div owns positioning; the inner container
  // only needs h-full/w-full, which mapbox never overrides.
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
