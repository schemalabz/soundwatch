"use client";

import { useTranslations } from "next-intl";
import type { IconType } from "react-icons";
import { FaVolumeHigh, FaWind, FaSun } from "react-icons/fa6";
import type { MapLayer } from "@/lib/geo";

interface LegendCfg {
  Icon: IconType;
  iconColor: string; // matches the sidebar tab icon colour
  titleKey: string;
  items: { color: string; labelKey: string }[];
}

// Per-layer explainer. Colours follow each layer's own map scale so the legend
// reads as a key to what's drawn on the map.
const LEGENDS: Record<MapLayer, LegendCfg> = {
  noise: {
    Icon: FaVolumeHigh,
    iconColor: "#ec832c",
    titleKey: "layerNoise",
    items: [
      { color: "#5ba834", labelKey: "legend.noise.quiet" },
      { color: "#c7c43c", labelKey: "legend.noise.moderate" },
      { color: "#ec832c", labelKey: "legend.noise.loud" },
      { color: "#d6342a", labelKey: "legend.noise.veryLoud" },
    ],
  },
  air: {
    Icon: FaWind,
    iconColor: "#5566cc",
    titleKey: "layerAir",
    items: [
      { color: "#4a90d9", labelKey: "legend.air.good" },
      { color: "#6a52c4", labelKey: "legend.air.moderate" },
      { color: "#6b1e8f", labelKey: "legend.air.unhealthy" },
    ],
  },
  uv: {
    Icon: FaSun,
    iconColor: "#c94fb0",
    titleKey: "layerUv",
    items: [
      { color: "#9fd0a8", labelKey: "legend.uv.low" },
      { color: "#e5c95a", labelKey: "legend.uv.moderate" },
      { color: "#c94fb0", labelKey: "legend.uv.high" },
    ],
  },
};

export default function MapLegend({ layer }: { layer: MapLayer }) {
  const t = useTranslations("map");
  const cfg = LEGENDS[layer];
  const { Icon } = cfg;
  const gradient = `linear-gradient(90deg, ${cfg.items.map((i) => i.color).join(", ")})`;

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 w-max max-w-[94%]">
      <div
        className="flex items-center gap-x-3 gap-y-1.5 flex-wrap justify-center rounded-xl border-[0.5px] border-hairline px-3 py-2 shadow-lg"
        style={{ background: "var(--sw-panel)" }}
      >
        {/* layer icon (tab colour) + name */}
        <span className="flex items-center gap-1.5 shrink-0">
          <Icon size={14} style={{ color: cfg.iconColor }} />
          <span className="sw-label text-xs text-ink">{t(cfg.titleKey)}</span>
        </span>

        {/* Full category swatches — from small screens up. */}
        <span className="hidden sm:flex items-center gap-x-3 gap-y-1.5 flex-wrap justify-center">
          {cfg.items.map((it) => (
            <span key={it.labelKey} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-[3px] shrink-0" style={{ background: it.color }} />
              <span className="text-[11px] text-muted whitespace-nowrap">{t(it.labelKey)}</span>
            </span>
          ))}
        </span>

        {/* Minimal gradient bar with endpoints — mobile only. */}
        <span className="flex sm:hidden items-center gap-1.5 min-w-0">
          <span className="text-[10px] text-muted whitespace-nowrap">
            {t(cfg.items[0].labelKey)}
          </span>
          <span className="h-2 w-16 rounded-full shrink-0" style={{ background: gradient }} />
          <span className="text-[10px] text-muted whitespace-nowrap">
            {t(cfg.items[cfg.items.length - 1].labelKey)}
          </span>
        </span>
      </div>
    </div>
  );
}
