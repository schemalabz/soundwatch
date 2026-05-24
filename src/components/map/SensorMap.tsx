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

interface SensorMapProps {
  sensors: SensorData[];
  selectedSensorId?: string | null;
  onSensorClick: (sensor: SensorData) => void;
}

export default function SensorMap({
  sensors,
  selectedSensorId,
  onSensorClick,
}: SensorMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const onSensorClickRef = useRef(onSensorClick);
  onSensorClickRef.current = onSensorClick;

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
    markersRef.current.clear();

    for (const sensor of sensors) {
      if (sensor.latitude == null || sensor.longitude == null) continue;

      const dba = sensor.latestReading?.noiseDba as number | null;
      const color = dba != null ? getNoiseLevelColor(dba) : "#a8a29e";

      const el = document.createElement("div");
      el.style.cursor = "pointer";

      const dot = document.createElement("div");
      dot.style.width = "24px";
      dot.style.height = "24px";
      dot.style.borderRadius = "50%";
      dot.style.backgroundColor = color;
      dot.style.border = "3px solid white";
      dot.style.boxShadow = "0 2px 6px rgba(0,0,0,0.25)";
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
  }, [sensors]);

  // Highlight selected marker
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
  }, [selectedSensorId]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
