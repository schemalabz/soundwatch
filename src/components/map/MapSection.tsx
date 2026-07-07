"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import SensorPanel, { type SensorData } from "@/components/dashboard/SensorPanel";
import MapTimeline from "@/components/map/MapTimeline";
import type { MapBounds } from "@/components/map/SensorMap";

const SensorMap = dynamic(() => import("@/components/map/SensorMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-bg">
      <span className="sw-label text-xs animate-pulse">···</span>
    </div>
  ),
});

export function MapSection({ sensors }: { sensors: SensorData[] }) {
  const t = useTranslations("map");
  const [selected, setSelected] = useState<SensorData | null>(null);
  const [inView, setInView] = useState<number | null>(null);
  const [heatmap, setHeatmap] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Mobile: as the page scrolls, the map shrinks up-and-right into a thumbnail.
  useEffect(() => {
    const sc = scrollRef.current;
    const mw = mapRef.current;
    if (!sc || !mw) return;

    const onScroll = () => {
      const tl = timelineRef.current;
      const isMobile = window.innerWidth < 768;
      if (!isMobile) {
        mw.style.transform = "";
        mw.style.boxShadow = "";
        if (tl) {
          tl.style.opacity = "1";
          tl.style.pointerEvents = "";
        }
        return;
      }
      const p = Math.min(1, sc.scrollTop / 220);
      const scale = 1 - p * 0.6;
      mw.style.transformOrigin = "top right";
      mw.style.transform = `scale(${scale})`;
      mw.style.boxShadow = p > 0.03 ? "0 8px 28px rgba(0,0,0,0.45)" : "none";
      // Hide the timeline once the map begins collapsing on scroll.
      if (tl) {
        const hidden = p > 0.1;
        tl.style.opacity = hidden ? "0" : "1";
        tl.style.pointerEvents = hidden ? "none" : "";
      }
    };

    sc.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      sc.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const handleBoundsChange = async (b: MapBounds) => {
    const params = new URLSearchParams({
      minLng: String(b.minLng),
      minLat: String(b.minLat),
      maxLng: String(b.maxLng),
      maxLat: String(b.maxLat),
    });
    try {
      const res = await fetch(`/api/sensors/bbox?${params.toString()}`);
      if (res.ok) {
        const data: { count: number } = await res.json();
        setInView(data.count);
      }
    } catch {
      // ignore transient fetch errors while panning
    }
  };

  return (
    <div
      ref={scrollRef}
      className="relative flex-1 min-h-0 overflow-y-auto md:overflow-hidden md:flex md:flex-row sw-scroll bg-bg"
    >
      {/* MAP COLUMN — padding around the map; sticky hero on mobile, fixed column (right) on desktop */}
      <div className="relative sticky top-0 z-20 h-[46vh] w-full p-3 md:order-2 md:relative md:z-0 md:h-full md:flex-1 md:p-4">
        <div
          ref={mapRef}
          className="relative w-full h-full rounded-2xl overflow-hidden border-[0.5px] border-hairline will-change-transform"
        >
          <SensorMap
            sensors={sensors}
            selectedSensorId={selected?.id}
            heatmap={heatmap}
            onSensorClick={(s) => setSelected(s as SensorData)}
            onBoundsChange={handleBoundsChange}
          />

          {/* Markers / Heatmap toggle */}
          <div className="absolute bottom-3 left-3 z-10 sw-chiptrack !bg-[var(--sw-panel)]/85 backdrop-blur-md border-[0.5px] border-hairline">
            <button
              className="sw-chip"
              data-active={!heatmap}
              onClick={() => setHeatmap(false)}
            >
              {t("markers")}
            </button>
            <button
              className="sw-chip"
              data-active={heatmap}
              onClick={() => setHeatmap(true)}
            >
              {t("heatmap")}
            </button>
          </div>

          {inView !== null && (
            <div className="absolute bottom-3 right-3 z-10 sw-badge !bg-[var(--sw-panel)] border-[0.5px] border-hairline px-3 py-1.5">
              <span className="font-light text-sm text-ink">{inView}</span>
              <span className="sw-label text-xs">{t("inView")}</span>
            </div>
          )}
        </div>

        {/* Floating timeline inside the map box — inset past the rounded corners and clear of the zoom controls */}
        <div
          ref={timelineRef}
          className="absolute z-30 left-6 right-16 top-6 md:left-8 md:right-20 md:top-8 transition-opacity duration-200"
        >
          <MapTimeline />
        </div>
      </div>

      {/* DETAIL PANEL — left column on desktop */}
      <aside className="relative z-10 bg-bg md:order-1 md:w-[440px] md:shrink-0 md:h-full md:overflow-y-auto md:border-r-[0.5px] md:border-hairline sw-scroll">
        <SensorPanel sensors={sensors} selected={selected} />
      </aside>
    </div>
  );
}
