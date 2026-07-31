"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import type { IconType } from "react-icons";
import { FaVolumeHigh, FaWind, FaSun } from "react-icons/fa6";
import SensorPanel, { type SensorData } from "@/components/dashboard/SensorPanel";
import MapTimeline from "@/components/map/MapTimeline";
import MapLegend from "@/components/map/MapLegend";
import type { MapBounds, MapLayers } from "@/components/map/SensorMap";
import { ATHENS_CENTER } from "@/lib/geo";
import { geocodeAddress } from "@/lib/geocode";

const SensorMap = dynamic(() => import("@/components/map/SensorMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-bg">
      <span className="sw-label text-xs animate-pulse">···</span>
    </div>
  ),
});

// Each layer is an accordion item: title badge + a description that reveals when
// active, tinted with the layer's own colour.
const LAYER_PILLS: {
  key: keyof MapLayers;
  label: string;
  desc: string;
  color: string;
  Icon: IconType;
}[] = [
  { key: "noise", label: "layerNoise", desc: "layerNoiseDesc", color: "#ec832c", Icon: FaVolumeHigh },
  { key: "air", label: "layerAir", desc: "layerAirDesc", color: "#5566cc", Icon: FaWind },
  { key: "uv", label: "layerUv", desc: "layerUvDesc", color: "#c94fb0", Icon: FaSun },
];

export function MapSection({ sensors }: { sensors: SensorData[] }) {
  const t = useTranslations("map");
  const total = sensors.length;

  const [selected, setSelected] = useState<SensorData | null>(null);
  const [inView, setInView] = useState<number | null>(null);
  const [layers, setLayers] = useState<MapLayers>({ noise: true, air: false, uv: false });

  // Active layer tab (single-select) drives which description panel shows and
  // which metric the graphs below render.
  const activeIndex = Math.max(0, LAYER_PILLS.findIndex((p) => layers[p.key]));
  const activeDesc = LAYER_PILLS[activeIndex].desc;
  const activeKey = LAYER_PILLS[activeIndex].key;

  // Εύρεση σημείου (find location) state.
  const [center, setCenter] = useState<{ lng: number; lat: number }>({
    lng: ATHENS_CENTER.lng,
    lat: ATHENS_CENTER.lat,
  });
  const [radiusKm, setRadiusKm] = useState(5);
  const [fitToken, setFitToken] = useState(0);
  const [address, setAddress] = useState("");
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Sensors within the current search radius (drives the in-radius graphs).
  const radiusSensors = sensors.filter((s) => {
    if (s.longitude == null || s.latitude == null) return false;
    const dLat = (s.latitude - center.lat) * 111;
    const dLng = (s.longitude - center.lng) * 111 * Math.cos((center.lat * Math.PI) / 180);
    return Math.hypot(dLat, dLng) <= radiusKm;
  });

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
        if (tl) { tl.style.opacity = "1"; tl.style.pointerEvents = ""; }
        return;
      }
      const p = Math.min(1, sc.scrollTop / 220);
      const scale = 1 - p * 0.6;
      mw.style.transformOrigin = "top right";
      mw.style.transform = `scale(${scale})`;
      mw.style.boxShadow = p > 0.03 ? "0 8px 28px rgba(0,0,0,0.45)" : "none";
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

  // Count sensors within the current viewport (client-side, from the mock set).
  const handleBoundsChange = (b: MapBounds) => {
    const n = sensors.filter(
      (s) =>
        s.longitude != null && s.latitude != null &&
        s.longitude >= b.minLng && s.longitude <= b.maxLng &&
        s.latitude >= b.minLat && s.latitude <= b.maxLat
    ).length;
    setInView(n);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotFound(false);
    setSearching(true);
    const r = await geocodeAddress(address);
    setSearching(false);
    if (!r) { setNotFound(true); return; }
    setCenter({ lng: r.lng, lat: r.lat });
    setFitToken((x) => x + 1);
  };

  const handleRadius = (km: number) => {
    setRadiusKm(km);
    setFitToken((x) => x + 1);
  };

  // Reflect the selected sensor in the URL (?sensor=id) so it is shareable.
  const handleSelect = (s: SensorData | null) => {
    setSelected(s);
    const params = new URLSearchParams(window.location.search);
    if (s) params.set("sensor", s.id);
    else params.delete("sensor");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  };

  // On load, restore the selection from the URL (deep link / refresh).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("sensor");
    if (id) {
      const s = sensors.find((x) => x.id === id);
      // one-time restore from the URL (deep link); intentional set-on-mount
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (s) setSelected(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={scrollRef}
      className="relative flex-1 min-h-0 overflow-y-auto md:overflow-hidden md:flex md:flex-row sw-scroll bg-bg"
    >
      {/* MAP COLUMN */}
      <div className="relative sticky top-0 z-20 h-[46vh] w-full p-3 md:order-2 md:relative md:z-0 md:h-full md:flex-1 md:p-4">
        <div
          ref={mapRef}
          className="relative w-full h-full rounded-2xl overflow-hidden border-[0.5px] border-hairline will-change-transform"
        >
          <SensorMap
            sensors={sensors}
            selectedSensorId={selected?.id}
            layers={layers}
            radiusCenter={center}
            radiusKm={radiusKm}
            fitToken={fitToken}
            onSensorClick={(s) => handleSelect(s as SensorData)}
            onClose={() => handleSelect(null)}
            onBoundsChange={handleBoundsChange}
          />

          {/* Inside the map wrapper so a sensor popup (z-40) can sit above it. */}
          <div
            ref={timelineRef}
            className="absolute z-30 left-4 right-14 top-4 md:left-6 md:right-16 md:top-6 transition-opacity duration-200"
          >
            <MapTimeline />
          </div>

          {inView !== null && (
            <div className="hidden md:block">
              <div className="absolute bottom-3 right-3 z-10 sw-badge !bg-[var(--sw-panel)] border-[0.5px] border-hairline px-3 py-1.5">
                <span className="font-light text-sm text-ink">{inView}</span>
                <span className="sw-label text-xs">{t("inView")}</span>
              </div>
            </div>
          )}

          {/* Per-layer explainer / legend (adapts to the active tab). */}
          <MapLegend layer={activeKey} />
        </div>
      </div>

      {/* DETAIL PANEL — left column on desktop */}
      <aside className="relative z-10 bg-bg md:order-1 md:w-[440px] md:shrink-0 md:h-full md:overflow-y-auto md:border-r-[0.5px] md:border-hairline sw-scroll">
        {/* Sensors in Athens — title + visible count + description (at the top) */}
        <div className="px-4 md:px-6 pt-6 pb-8 sw-section">
          <div className="flex items-center gap-2">
            <h2 className="sw-h text-[22px]">{t("sensorsTitle")}</h2>
            <span className="sw-label text-sm">
              ({t("sensorsSeeing", { inView: inView ?? total, total })})
            </span>
          </div>
          <p className="text-muted text-sm mt-2 leading-relaxed">
            {t("sensorsDesc", { total })}
          </p>
        </div>

        {/* Layer tabs — inline, single-select. The active tab and its
            description panel share one dark background, joined with curved
            edges so they read as a single continuous shape. */}
        <div className="p-3 md:p-4">
          <div className="flex">
            {LAYER_PILLS.map(({ key, label, color, Icon }) => {
              const active = layers[key];
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={active}
                  onClick={() =>
                    setLayers({ noise: key === "noise", air: key === "air", uv: key === "uv" })
                  }
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-[13px] rounded-t-xl transition-colors"
                  style={{
                    background: active ? "var(--sw-tab-bg)" : "transparent",
                    color: active ? "#fff" : "var(--sw-muted)",
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  <Icon size={14} className="shrink-0" style={{ color }} />
                  <span className="truncate">{t(label)}</span>
                </button>
              );
            })}
          </div>
          {/* continuous body: same dark bg; only the top corner NOT under the
              active tab is rounded, so the tab merges seamlessly into it */}
          <div
            className="px-4 py-3 text-xs leading-relaxed"
            style={{
              background: "var(--sw-tab-bg)",
              color: "rgba(255,255,255,0.72)",
              borderRadius:
                activeIndex === 0
                  ? "0 12px 12px 12px"
                  : activeIndex === LAYER_PILLS.length - 1
                    ? "12px 0 12px 12px"
                    : "12px",
            }}
          >
            {t(activeDesc)}
          </div>
        </div>

        {/* Εύρεση σημείου — address search + radius */}
        <div className="px-4 md:px-6 py-6 sw-section">
          <h3 className="sw-h text-[16px]">{t("findLocation")}</h3>

          <label className="sw-label text-xs mt-3 block">{t("addressLabel")}</label>
          <form onSubmit={handleSearch} className="mt-2 flex gap-2">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t("addressPlaceholder")}
              className="flex-1 rounded-lg border-[0.5px] border-hairline bg-transparent px-3 py-2 text-sm outline-none focus:border-ink"
            />
            <button
              type="submit"
              disabled={searching}
              className="rounded-lg border-[0.5px] border-hairline px-3 py-2 text-sm hover:bg-ink hover:text-bg transition disabled:opacity-50"
            >
              {t("search")}
            </button>
          </form>
          {notFound && <p className="text-xs text-[#d6342a] mt-1.5">{t("notFound")}</p>}

          <label className="sw-label text-xs mt-4 block">{t("radiusLabel")}</label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range" min={0.5} max={10} step={0.5} value={radiusKm}
              onChange={(e) => handleRadius(Number(e.target.value))}
              className="flex-1 accent-[var(--sw-ink)]"
            />
            <span className="text-sm tabular-nums w-14 text-right">{radiusKm} km</span>
          </div>
        </div>

        <SensorPanel
          sensors={sensors}
          selected={selected}
          activeLayer={activeKey}
          radiusSensors={radiusSensors}
        />
      </aside>
    </div>
  );
}
