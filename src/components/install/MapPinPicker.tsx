"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// Fixed center pin: the map pans under a crosshair, and confirming reads the
// map center. More reliable on a phone than dragging a marker, and it works
// with GPS permission denied — which is the whole reason this picker exists.
export default function MapPinPicker({
  center,
  onConfirm,
  confirmLabel,
}: {
  center: { latitude: number; longitude: number };
  onConfirm: (c: { latitude: number; longitude: number }) => void;
  confirmLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [center.longitude, center.latitude],
      zoom: 16,
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div style={{ position: "relative", height: 280, borderRadius: 12,
                    overflow: "hidden", border: "1px solid #ccc" }}>
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
        <div style={{ pointerEvents: "none", position: "absolute", left: "50%", top: "50%",
                      transform: "translate(-50%, -100%)", fontSize: 28 }}>📍</div>
      </div>
      <button
        style={{ font: "inherit", fontSize: 16, padding: "12px 18px", borderRadius: 10,
                 border: "1px solid #ccc", background: "#fff", width: "100%", marginTop: 10 }}
        onClick={() => {
          const c = mapRef.current?.getCenter();
          if (c) onConfirm({ latitude: c.lat, longitude: c.lng });
        }}
      >
        {confirmLabel}
      </button>
    </div>
  );
}
