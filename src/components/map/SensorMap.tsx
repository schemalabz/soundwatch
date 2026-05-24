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
      el.style.transition = "transform 0.2s";

      el.addEventListener("click", (e) => {
        e.stopPropagation();
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
      const el = marker.getElement();
      if (id === selectedSensorId) {
        el.style.transform = "scale(1.4)";
        el.style.zIndex = "10";
      } else {
        el.style.transform = "scale(1)";
        el.style.zIndex = "1";
      }
    });
  }, [selectedSensorId]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
