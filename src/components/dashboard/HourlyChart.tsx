"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import SectionHeader from "@/components/dashboard/SectionHeader";
import { smoothPath } from "@/lib/smoothPath";
import type { MapLayer } from "@/lib/geo";

type SensorLike = { latestReading: Record<string, unknown> | null };

interface MetricCfg {
  field: string;
  unit: string;
  decimals: number;
  labelKey: string;
  profile: number[]; // 24-hour diurnal multiplier applied to the average
  gradient: [number, string][]; // [offset%, color] top (high) -> bottom (low)
  fallbackAvg: number;
}

// Diurnal shapes (24 values) applied to the in-radius average of each metric.
const METRICS: Record<MapLayer, MetricCfg> = {
  noise: {
    field: "noiseDba",
    unit: "dBA",
    decimals: 1,
    labelKey: "layerNoise",
    profile: [
      0.86, 0.81, 0.77, 0.75, 0.76, 0.83, 0.93, 1.05, 1.12, 1.1, 1.08, 1.1,
      1.13, 1.12, 1.09, 1.07, 1.09, 1.14, 1.18, 1.16, 1.1, 1.02, 0.95, 0.9,
    ],
    gradient: [
      [0, "#d6342a"], [25, "#ec832c"], [50, "#e8b335"], [72, "#c7c43c"], [100, "#5ba834"],
    ],
    fallbackAvg: 55,
  },
  air: {
    field: "pm25",
    unit: "µg/m³",
    decimals: 1,
    labelKey: "layerAir",
    profile: [
      1.05, 1.02, 0.98, 0.95, 0.95, 1.0, 1.1, 1.2, 1.22, 1.1, 0.98, 0.9,
      0.86, 0.84, 0.86, 0.92, 1.02, 1.12, 1.2, 1.18, 1.12, 1.1, 1.08, 1.06,
    ],
    gradient: [[0, "#6b1e8f"], [35, "#7048c0"], [70, "#5566cc"], [100, "#4a90d9"]],
    fallbackAvg: 12,
  },
  uv: {
    field: "uvIndex",
    unit: "UV",
    decimals: 2,
    labelKey: "layerUv",
    profile: [
      0, 0, 0, 0, 0, 0.05, 0.15, 0.35, 0.65, 0.95, 1.3, 1.6, 1.8, 1.85, 1.7,
      1.4, 1.05, 0.7, 0.4, 0.15, 0.03, 0, 0, 0,
    ],
    gradient: [[0, "#c94fb0"], [45, "#e8933a"], [100, "#e5c95a"]],
    fallbackAvg: 0.1,
  },
};

const HOUR_TICKS = [
  { label: "00:00", align: "left" as const },
  { label: "06:00", align: "center" as const },
  { label: "12:00", align: "center" as const },
  { label: "18:00", align: "center" as const },
  { label: "23:00", align: "right" as const },
];

function averageOf(sensors: SensorLike[], field: string): number | null {
  const vals = sensors
    .map((s) => s.latestReading?.[field])
    .filter((v): v is number => typeof v === "number");
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function valueAt(hours: number[], hourFloat: number): number {
  const i = Math.floor(hourFloat);
  const f = hourFloat - i;
  const a = hours[Math.min(i, 23)];
  const b = hours[Math.min(i + 1, 23)];
  return a + (b - a) * f;
}

export default function HourlyChart({
  metric = "noise",
  sensors = [],
}: {
  metric?: MapLayer;
  sensors?: SensorLike[];
}) {
  const t = useTranslations("dashboard");
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="sw-section pb-12">
      <SectionHeader
        title={t("byHour")}
        info
        right={
          <button
            className="sw-label text-xs hover:text-ink"
            type="button"
            onClick={() => setExpanded(true)}
          >
            {t("expand")}
          </button>
        }
      />
      <div className="px-6 pb-5 mt-7">
        <HourlyBody height={200} metric={metric} sensors={sensors} />
      </div>

      {expanded && (
        <HourlyModal onClose={() => setExpanded(false)} metric={metric} sensors={sensors} />
      )}
    </section>
  );
}

function HourlyModal({
  onClose,
  metric,
  sensors,
}: {
  onClose: () => void;
  metric: MapLayer;
  sensors: SensorLike[];
}) {
  const t = useTranslations("dashboard");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-3xl bg-panel border-[0.5px] border-hairline rounded-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5 gap-4">
          <div>
            <h3 className="sw-h text-[22px]">{t("byHour")}</h3>
            <p className="sw-label text-xs mt-1.5">{t("byHourSubtitle")}</p>
          </div>
          <button onClick={onClose} className="sw-chip !p-2 leading-none shrink-0" aria-label={t("close")}>
            ✕
          </button>
        </div>

        <HourlyBody height={340} metric={metric} sensors={sensors} />
      </div>
    </div>
  );
}

function HourlyBody({
  height,
  metric,
  sensors,
}: {
  height: number;
  metric: MapLayer;
  sensors: SensorLike[];
}) {
  const t = useTranslations("dashboard");
  const tMap = useTranslations("map");
  const gradId = useId().replace(/:/g, "");
  const cfg = METRICS[metric];

  const avg = averageOf(sensors, cfg.field);
  const base = avg ?? cfg.fallbackAvg;
  const values = cfg.profile.map((m) => base * m);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hx, setHx] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const top = 12;
  const bottom = 4;
  const innerH = height - top - bottom;

  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  // Frame the curve with a little padding; keep a floor at 0 for UV.
  const domainLo = metric === "uv" ? 0 : vMin - (vMax - vMin) * 0.15;
  const domainHi = vMax + (vMax - vMin) * 0.08 || vMax + 1;
  const span = domainHi - domainLo || 1;

  const xOf = (h: number) => (h / 23) * w;
  const yOf = (v: number) => top + (1 - (v - domainLo) / span) * innerH;

  const pts: [number, number][] = values.map((v, h) => [xOf(h), yOf(v)]);
  const line = smoothPath(pts);
  const area = `${line} L${w},${height} L0,${height} Z`;

  const frac = hx != null && w > 0 ? hx / w : null;
  const hourFloat = frac != null ? frac * 23 : null;
  const hoverVal = hourFloat != null ? valueAt(values, hourFloat) : null;
  const hourLabel =
    hourFloat != null ? `${String(Math.round(hourFloat)).padStart(2, "0")}:00` : "";

  return (
    <div className="min-w-0">
      {/* caption: average of the metric across the in-radius sensors */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-4">
        <span className="font-light text-3xl text-ink tabular-nums leading-none">
          {avg != null ? avg.toFixed(cfg.decimals) : "—"}
        </span>
        <span className="sw-label text-xs">
          {cfg.unit} · {tMap(cfg.labelKey)}
        </span>
        <span className="sw-label text-xs ml-auto">
          {sensors.length > 0
            ? t("inRadius", { count: sensors.length })
            : t("noSensorsInRadius")}
        </span>
      </div>

      <div className="flex items-stretch gap-2">
        <div
          className="sw-label text-[11px] self-center text-center shrink-0"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", paddingBottom: 18 }}
        >
          {cfg.unit}
        </div>

        <div className="flex-1 min-w-0">
          <div
            ref={wrapRef}
            className="relative"
            style={{ height }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setHx(Math.max(0, Math.min(rect.width, e.clientX - rect.left)));
            }}
            onMouseLeave={() => setHx(null)}
          >
            {w > 0 && (
              <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} style={{ display: "block", maxWidth: "100%" }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1={top} x2="0" y2={height - bottom} gradientUnits="userSpaceOnUse">
                    {cfg.gradient.map(([o, c]) => (
                      <stop key={o} offset={`${o}%`} stopColor={c} />
                    ))}
                  </linearGradient>
                </defs>
                <path d={area} fill={`url(#${gradId})`} fillOpacity={0.12} />
                <path d={line} fill="none" stroke={`url(#${gradId})`} strokeWidth={3} strokeLinecap="round" />

                {hx != null && hoverVal != null && (
                  <>
                    <line x1={hx} y1={top} x2={hx} y2={height} stroke="var(--sw-ink)" strokeOpacity={0.6} strokeWidth={1} strokeDasharray="3 3" />
                    <circle cx={hx} cy={yOf(hoverVal)} r={4} fill={cfg.gradient[0][1]} stroke="var(--sw-bg)" strokeWidth={1.5} />
                  </>
                )}
              </svg>
            )}

            {hx != null && hoverVal != null && (
              <div
                className="absolute pointer-events-none bg-panel border-[0.5px] border-hairline rounded-md px-3 py-2 shadow-lg"
                style={{ left: Math.min(Math.max(hx + 12, 0), Math.max(0, w - 110)), top: 6, minWidth: 96 }}
              >
                <div className="sw-label text-xs mb-0.5">{hourLabel}</div>
                <div className="font-light text-2xl text-ink tabular-nums leading-none">
                  {hoverVal.toFixed(cfg.decimals)}
                  <span className="text-xs text-muted ml-1">{cfg.unit}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center pt-1.5">
            {HOUR_TICKS.map((tick) => (
              <div key={tick.label} className="flex-1 sw-label text-xs" style={{ textAlign: tick.align }}>
                {tick.label}
              </div>
            ))}
          </div>
          <div className="text-center sw-label text-[11px] mt-1">{t("hourOfDay")}</div>
        </div>
      </div>
    </div>
  );
}
