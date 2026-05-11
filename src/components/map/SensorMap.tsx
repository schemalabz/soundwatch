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
  latestReading: {
    noiseDba: number | null;
  } | null;
}

interface SensorMapProps {
  sensors: SensorData[];
}

export default function SensorMap({ sensors }: SensorMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!mapContainer.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      console.warn("Mapbox token not set");
      return;
    }

    mapboxgl.accessToken = token;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [ATHENS_CENTER.lng, ATHENS_CENTER.lat],
      zoom: ATHENS_ZOOM,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    return () => {
      map.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const sensor of sensors) {
      if (sensor.latitude == null || sensor.longitude == null) continue;

      const dba = sensor.latestReading?.noiseDba;
      const color = dba != null ? getNoiseLevelColor(dba) : "#a8a29e";

      const el = document.createElement("div");
      el.style.width = "24px";
      el.style.height = "24px";
      el.style.borderRadius = "50%";
      el.style.backgroundColor = color;
      el.style.border = "3px solid white";
      el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.25)";
      el.style.cursor = "pointer";

      const popup = new mapboxgl.Popup({ offset: 15 }).setHTML(`
        <div style="font-family: system-ui; padding: 4px;">
          <strong style="color: #1c1917;">${sensor.name || sensor.deviceId}</strong><br/>
          ${dba != null ? `<span style="font-size: 1.2em; font-weight: bold; color: ${color};">${dba.toFixed(1)} dBA</span>` : '<span style="color: #78716c;">No data</span>'}
          <br/>
          <a href="/sensors/${sensor.id}" style="color: #c2410c; text-decoration: underline; font-size: 0.85em;">View details →</a>
        </div>
      `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([sensor.longitude, sensor.latitude])
        .setPopup(popup)
        .addTo(map.current!);

      markersRef.current.push(marker);
    }
  }, [sensors]);

  return (
    <div ref={mapContainer} className="w-full h-full" />
  );
}
