"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import SectionHeader from "@/components/dashboard/SectionHeader";
import { seasonsData } from "@/lib/mockData";
import { smoothPath } from "@/lib/smoothPath";

const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

// Per-series rendering style.
type SeriesStyle =
  | { kind: "outline"; color: string }
  | { kind: "fill"; color: string; line: string }
  | { kind: "dots"; color: string; legend: string };

type SeasonKey = "construction" | "traffic" | "nightlife";

const STYLE: Record<SeasonKey, SeriesStyle> = {
  construction: { kind: "outline", color: "#7cc043" },
  traffic: { kind: "fill", color: "#4a9e2a", line: "#86cc4d" },
  nightlife: { kind: "dots", color: "#d6342a", legend: "#a82f27" },
};

// Draw back-to-front; legend left-to-right.
const DRAW_ORDER: SeasonKey[] = ["nightlife", "traffic", "construction"];
const LEGEND: SeasonKey[] = ["construction", "traffic", "nightlife"];

type Visible = Record<string, boolean>;

function valueAt(monthly: number[], monthFloat: number): number {
  const i = Math.floor(monthFloat);
  const f = monthFloat - i;
  const a = monthly[Math.min(i, 11)];
  const b = monthly[Math.min(i + 1, 11)];
  return a + (b - a) * f;
}

export default function SeasonsChart({ nowMonth }: { nowMonth: number }) {
  const t = useTranslations("dashboard");
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState<Visible>({
    construction: true,
    traffic: true,
    nightlife: true,
  });
  const toggle = (k: string) => setVisible((v) => ({ ...v, [k]: !v[k] }));

  return (
    <section className="sw-section pb-12">
      <SectionHeader
        title={t("seasons")}
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
        <SeasonsBody height={180} nowMonth={nowMonth} visible={visible} toggle={toggle} />
      </div>

      {expanded && (
        <SeasonsModal
          nowMonth={nowMonth}
          visible={visible}
          toggle={toggle}
          onClose={() => setExpanded(false)}
        />
      )}
    </section>
  );
}

function SeasonsModal({
  nowMonth,
  visible,
  toggle,
  onClose,
}: {
  nowMonth: number;
  visible: Visible;
  toggle: (k: string) => void;
  onClose: () => void;
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
            <h3 className="sw-h text-[22px]">{t("seasons")}</h3>
            <p className="sw-label text-xs mt-1.5">{t("seasonsSubtitle")}</p>
          </div>
          <button
            onClick={onClose}
            className="sw-chip !p-2 leading-none shrink-0"
            aria-label={t("close")}
          >
            ✕
          </button>
        </div>

        <SeasonsBody height={340} nowMonth={nowMonth} visible={visible} toggle={toggle} />

        <div className="mt-3 flex justify-end">
          <span className="sw-label text-xs">{t("indexHint")}</span>
        </div>
      </div>
    </div>
  );
}

function SeasonsBody({
  height,
  nowMonth,
  visible,
  toggle,
}: {
  height: number;
  nowMonth: number;
  visible: Visible;
  toggle: (k: string) => void;
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const dotsId = useId().replace(/:/g, "");
  const series = seasonsData();
  const byKey: Record<string, number[]> = Object.fromEntries(
    series.map((s) => [s.key, s.monthly])
  );

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

  const top = 8;
  const bottom = 4;
  const innerH = height - top - bottom;
  const xOf = (m: number) => (m / 11) * w;
  const yOf = (v: number) => top + (1 - v) * innerH;

  const buildPaths = (monthly: number[]) => {
    const pts: [number, number][] = monthly.map((v, m) => [xOf(m), yOf(v)]);
    const line = smoothPath(pts);
    const area = `${line} L${w},${height} L0,${height} Z`;
    return { line, area };
  };

  const frac = hx != null && w > 0 ? hx / w : null;
  const monthFloat = frac != null ? frac * 11 : null;
  const year = new Date().getFullYear();
  let dateLabel = "";
  if (frac != null) {
    const day = Math.round(frac * 364);
    const d = new Date(year, 0, 1 + day);
    dateLabel = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(d);
  }

  const hoverColor = (k: SeasonKey): string => {
    const s = STYLE[k];
    return s.kind === "fill" ? s.line : s.color;
  };

  return (
    <div>
      <div className="flex items-stretch gap-2">
        <div
          className="sw-label text-[11px] self-center text-center"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", paddingBottom: 14 }}
        >
          {t("intensity")}
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
                  <pattern id={dotsId} patternUnits="userSpaceOnUse" width="6" height="7">
                    <circle cx="3" cy="3.5" r="0.75" fill={STYLE.nightlife.color} />
                  </pattern>
                </defs>

                {DRAW_ORDER.map((k) => {
                  if (!visible[k]) return null;
                  const s = STYLE[k];
                  const { line, area } = buildPaths(byKey[k]);
                  if (s.kind === "dots") {
                    return <path key={k} d={area} fill={`url(#${dotsId})`} />;
                  }
                  if (s.kind === "fill") {
                    return (
                      <g key={k}>
                        <path d={area} fill={s.color} fillOpacity={0.92} />
                        <path d={line} fill="none" stroke={s.line} strokeWidth={1.5} />
                      </g>
                    );
                  }
                  return <path key={k} d={line} fill="none" stroke={s.color} strokeWidth={2} />;
                })}

                {/* now marker */}
                <line x1={xOf(nowMonth)} y1={top} x2={xOf(nowMonth)} y2={height} stroke="var(--sw-ink)" strokeWidth={1} />
                <line x1={xOf(nowMonth) - 3} y1={top} x2={xOf(nowMonth) + 3} y2={top} stroke="var(--sw-ink)" strokeWidth={1} />

                {/* hover scrubber + dots */}
                {hx != null && monthFloat != null && (
                  <>
                    <line x1={hx} y1={top} x2={hx} y2={height} stroke="var(--sw-ink)" strokeOpacity={0.7} strokeWidth={1} strokeDasharray="3 3" />
                    {LEGEND.filter((k) => visible[k]).map((k) => (
                      <circle
                        key={k}
                        cx={hx}
                        cy={yOf(valueAt(byKey[k], monthFloat))}
                        r={3.5}
                        fill={hoverColor(k)}
                        stroke="var(--sw-bg)"
                        strokeWidth={1}
                      />
                    ))}
                  </>
                )}
              </svg>
            )}

            {/* tooltip */}
            {hx != null && monthFloat != null && (
              <div
                className="absolute pointer-events-none bg-panel border-[0.5px] border-hairline rounded-md px-3 py-2 shadow-lg"
                style={{
                  left: Math.min(Math.max(hx + 12, 0), Math.max(0, w - 150)),
                  top: 6,
                  minWidth: 130,
                }}
              >
                <div className="sw-label text-xs mb-1.5">{dateLabel}</div>
                {LEGEND.filter((k) => visible[k]).map((k) => (
                  <div key={k} className="flex items-center justify-between gap-3 text-xs">
                    <span className="flex items-center gap-1.5 text-ink">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: hoverColor(k) }}
                      />
                      {t(`sources.${k}`)}
                    </span>
                    <span className="font-light text-ink tabular-nums">
                      {(valueAt(byKey[k], monthFloat) * 12).toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center pt-1.5">
            {MONTH_LETTERS.map((m, i) => (
              <div key={i} className="flex-1 text-center sw-label text-xs">
                {m}
              </div>
            ))}
          </div>
          <div className="text-center sw-label text-[11px] mt-1">{t("month")}</div>
        </div>
      </div>

      {/* legend (interactive) */}
      <div className="mt-3 flex items-center gap-4 flex-wrap">
        {LEGEND.map((k) => {
          const s = STYLE[k];
          const swatchColor = s.kind === "dots" ? s.legend : s.color;
          const outline = s.kind === "outline";
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggle(k)}
              className="flex items-center gap-1.5"
              aria-pressed={visible[k]}
              style={{ opacity: visible[k] ? 1 : 0.4 }}
            >
              <span
                className="w-3 h-3 rounded-[2px]"
                style={{
                  background: outline ? "transparent" : swatchColor,
                  border: `1.5px solid ${swatchColor}`,
                }}
              />
              <span className="sw-label text-xs">{t(`sources.${k}`)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
