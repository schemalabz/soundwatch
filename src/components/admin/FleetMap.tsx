"use client";

// The fleet page's "Where they are": installed units on the dashboard's map
// (MapCanvas owns the Mapbox lifecycle, style and tokenless fallback). Each
// dot is coloured by status, names its store on hover, and opens the unit on
// click. Load it with next/dynamic, ssr: false — mapbox-gl needs window.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";
import MapCanvas from "@/components/dashboard/MapCanvas";
import { STATUS_META } from "@/components/admin/fleetUi";
import type { FleetStatus } from "@/lib/fleet/status";

export interface FleetMapPoint {
  id: string;
  latitude: number;
  longitude: number;
  status: FleetStatus;
  title: string;
}

export default function FleetMap({ points }: { points: FleetMapPoint[] }) {
  const router = useRouter();
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    if (!map) return;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    // No removeControl: MapCanvas has already called map.remove() by the time
    // this runs, and that disposes the control with the map.
    return () => { fitted.current = false; };
  }, [map]);

  // The fleet reloads every 30 s, so markers are rebuilt on each change; the
  // view is fitted to them only once, so a reload doesn't undo your panning.
  useEffect(() => {
    if (!map) return;
    const markers = points.map((p) => {
      const el = document.createElement("button");
      el.type = "button";
      el.title = `${p.title} · ${STATUS_META[p.status].label}`;
      el.setAttribute("aria-label", el.title);
      el.className = `block size-3.5 cursor-pointer rounded-full border-2 border-white shadow-[0_0_0_1px_#bfc0c0] ${STATUS_META[p.status].dot}`;
      el.addEventListener("click", () => router.push(`/admin/units/${p.id}`));
      return new mapboxgl.Marker({ element: el }).setLngLat([p.longitude, p.latitude]).addTo(map);
    });
    if (!fitted.current && points.length > 0) {
      const b = new mapboxgl.LngLatBounds();
      points.forEach((p) => b.extend([p.longitude, p.latitude]));
      map.fitBounds(b, { padding: 40, maxZoom: 14, duration: 0 });
      fitted.current = true;
    }
    return () => markers.forEach((m) => m.remove());
  }, [map, points, router]);

  return (
    <div className="relative h-[430px] overflow-hidden rounded-xl border border-border bg-[#eef0f2]">
      <MapCanvas onReady={setMap} />
    </div>
  );
}
