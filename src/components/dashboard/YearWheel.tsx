"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import SectionHeader from "@/components/dashboard/SectionHeader";
import { yearData } from "@/lib/mockData";
import { scaleColor } from "@/lib/scale";

const CX = 110;
const CY = 110;
const RI = 64;
const RO = 92;
const RL = 78; // month-letter radius
const GAP = 1.4; // degrees between segments
const LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function pt(angleDeg: number, r: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function sector(a0: number, a1: number): string {
  const [x0, y0] = pt(a0, RO);
  const [x1, y1] = pt(a1, RO);
  const [x2, y2] = pt(a1, RI);
  const [x3, y3] = pt(a0, RI);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0},${y0} A${RO},${RO} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${RI},${RI} 0 ${large} 0 ${x3},${y3} Z`;
}

export default function YearWheel({ nowMonth }: { nowMonth: number }) {
  const t = useTranslations("dashboard");
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="sw-section pb-12">
      <SectionHeader
        title={t("yearGlance")}
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

      <div className="px-6 pb-6 flex items-center justify-center mt-7">
        <Wheel nowMonth={nowMonth} maxWidth={440} />
      </div>

      {expanded && (
        <WheelModal nowMonth={nowMonth} onClose={() => setExpanded(false)} />
      )}
    </section>
  );
}

function WheelModal({ nowMonth, onClose }: { nowMonth: number; onClose: () => void }) {
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
        className="relative z-10 w-full max-w-lg bg-panel border-[0.5px] border-hairline rounded-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5 gap-4">
          <div>
            <h3 className="sw-h text-[22px]">{t("yearGlance")}</h3>
            <p className="sw-label text-xs mt-1.5">{t("yearGlanceSubtitle")}</p>
          </div>
          <button
            onClick={onClose}
            className="sw-chip !p-2 leading-none shrink-0"
            aria-label={t("close")}
          >
            ✕
          </button>
        </div>

        <div className="flex items-center justify-center">
          <Wheel nowMonth={nowMonth} maxWidth={420} />
        </div>
      </div>
    </div>
  );
}

function Wheel({ nowMonth, maxWidth }: { nowMonth: number; maxWidth: number }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const values = yearData();
  const [hovered, setHovered] = useState<number | null>(null);

  const display = hovered ?? nowMonth;
  const monthName = new Intl.DateTimeFormat(locale, { month: "short" }).format(
    new Date(2026, display, 1)
  );
  const indexValue = (values[display] * 12).toFixed(1);

  const pointer = pt(-90 + nowMonth * 30 + 15, RO + 4);
  const pointerInner = pt(-90 + nowMonth * 30 + 15, RO - 2);

  return (
    <svg
      viewBox="0 0 220 220"
      width="100%"
      style={{ maxWidth, height: "auto", aspectRatio: "1 / 1" }}
      onMouseLeave={() => setHovered(null)}
    >
      {values.map((v, m) => {
        const a0 = -90 + m * 30 + GAP / 2;
        const a1 = -90 + (m + 1) * 30 - GAP / 2;
        const selected = m === display;
        return (
          <path
            key={m}
            d={sector(a0, a1)}
            fill={scaleColor(v)}
            stroke={selected ? "var(--sw-ink)" : "none"}
            strokeWidth={selected ? 1.5 : 0}
            style={{
              cursor: "pointer",
              opacity: hovered != null && !selected ? 0.82 : 1,
              transition: "opacity 150ms, stroke 150ms",
            }}
            onMouseEnter={() => setHovered(m)}
          />
        );
      })}

      {LETTERS.map((l, m) => {
        const [x, y] = pt(-90 + m * 30 + 15, RL);
        return (
          <text
            key={m}
            x={x}
            y={y}
            dominantBaseline="middle"
            textAnchor="middle"
            pointerEvents="none"
            style={{ fontFamily: "var(--font-jura), sans-serif", fontSize: 10, fill: "var(--sw-bg)", opacity: 0.85 }}
          >
            {l}
          </text>
        );
      })}

      {/* pointer to current month */}
      <line x1={pointerInner[0]} y1={pointerInner[1]} x2={pointer[0]} y2={pointer[1]} stroke="var(--sw-ink)" strokeWidth={1} />
      <circle cx={pointer[0]} cy={pointer[1]} r={2.2} fill="var(--sw-ink)" />

      {/* center label (reflects hovered/selected month) */}
      <text x={CX} y={104} textAnchor="middle" dominantBaseline="middle" pointerEvents="none" style={{ fontWeight: 200, fontSize: 22, fill: "var(--sw-ink)" }}>
        {monthName}
      </text>
      <text x={CX} y={124} textAnchor="middle" dominantBaseline="middle" pointerEvents="none" style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 12, fill: "var(--sw-muted)" }}>
        {indexValue} {t("index")}
      </text>
    </svg>
  );
}
