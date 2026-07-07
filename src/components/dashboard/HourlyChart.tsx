"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import SectionHeader from "@/components/dashboard/SectionHeader";
import { hourlyData } from "@/lib/mockData";
import { smoothPath } from "@/lib/smoothPath";
import { scaleColor } from "@/lib/scale";

const HOUR_TICKS = [
  { label: "00:00", align: "left" as const },
  { label: "06:00", align: "center" as const },
  { label: "12:00", align: "center" as const },
  { label: "18:00", align: "center" as const },
  { label: "23:00", align: "right" as const },
];

function valueAt(hours: number[], hourFloat: number): number {
  const i = Math.floor(hourFloat);
  const f = hourFloat - i;
  const a = hours[Math.min(i, 23)];
  const b = hours[Math.min(i + 1, 23)];
  return a + (b - a) * f;
}

export default function HourlyChart() {
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
        <HourlyBody height={200} />
      </div>

      {expanded && <HourlyModal onClose={() => setExpanded(false)} />}
    </section>
  );
}

function HourlyModal({ onClose }: { onClose: () => void }) {
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

        <HourlyBody height={340} />

        <div className="mt-3 flex justify-end">
          <span className="sw-label text-xs">{t("indexHint")}</span>
        </div>
      </div>
    </div>
  );
}

function HourlyBody({ height }: { height: number }) {
  const t = useTranslations("dashboard");
  const gradId = useId().replace(/:/g, "");
  const hours = hourlyData();

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
  const xOf = (h: number) => (h / 23) * w;
  const yOf = (v: number) => top + (1 - v) * innerH;

  const pts: [number, number][] = hours.map((v, h) => [xOf(h), yOf(v)]);
  const line = smoothPath(pts);
  const area = `${line} L${w},${height} L0,${height} Z`;

  const frac = hx != null && w > 0 ? hx / w : null;
  const hourFloat = frac != null ? frac * 23 : null;
  const hoverVal = hourFloat != null ? valueAt(hours, hourFloat) : null;
  const hourLabel =
    hourFloat != null ? `${String(Math.round(hourFloat)).padStart(2, "0")}:00` : "";

  return (
    <div className="flex items-stretch gap-2">
      <div
        className="sw-label text-[11px] self-center text-center"
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", paddingBottom: 18 }}
      >
        {t("indexAxis")}
      </div>

      <div className="flex-1">
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
            <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} style={{ display: "block" }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1={top} x2="0" y2={height - bottom} gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#d6342a" />
                  <stop offset="25%" stopColor="#ec832c" />
                  <stop offset="50%" stopColor="#e8b335" />
                  <stop offset="72%" stopColor="#c7c43c" />
                  <stop offset="100%" stopColor="#5ba834" />
                </linearGradient>
              </defs>
              <path d={area} fill={`url(#${gradId})`} fillOpacity={0.12} />
              <path d={line} fill="none" stroke={`url(#${gradId})`} strokeWidth={3} strokeLinecap="round" />

              {hx != null && hoverVal != null && (
                <>
                  <line x1={hx} y1={top} x2={hx} y2={height} stroke="var(--sw-ink)" strokeOpacity={0.6} strokeWidth={1} strokeDasharray="3 3" />
                  <circle cx={hx} cy={yOf(hoverVal)} r={4} fill={scaleColor(hoverVal)} stroke="var(--sw-bg)" strokeWidth={1.5} />
                </>
              )}
            </svg>
          )}

          {hx != null && hoverVal != null && (
            <div
              className="absolute pointer-events-none bg-panel border-[0.5px] border-hairline rounded-md px-3 py-2 shadow-lg"
              style={{ left: Math.min(Math.max(hx + 12, 0), Math.max(0, w - 96)), top: 6, minWidth: 84 }}
            >
              <div className="sw-label text-xs mb-0.5">{hourLabel}</div>
              <div className="font-light text-2xl text-ink tabular-nums leading-none">
                {(hoverVal * 12).toFixed(1)}
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
  );
}
