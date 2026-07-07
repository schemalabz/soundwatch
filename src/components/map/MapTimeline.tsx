"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";

type Mode = "day" | "month" | "year";

// Months shown as labels on the compact (mobile) scrubber.
const KEY_MONTHS = new Set([0, 4, 7, 11]);

export default function MapTimeline() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [mode, setMode] = useState<Mode>("month");
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setMonth((m) => (m + 1) % 12), 900);
    return () => clearInterval(id);
  }, [playing]);

  const monthName = (m: number) =>
    new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(2026, m, 1));

  const pick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - rect.left) / rect.width;
    setMonth(Math.max(0, Math.min(11, Math.floor(f * 12))));
  };

  const cursorPct = ((month + 0.5) / 12) * 100;

  return (
    <div className="flex items-center gap-1.5 bg-[var(--sw-panel)]/80 backdrop-blur-md border-[0.5px] border-hairline rounded-lg p-1 shadow-lg">
      {/* mode */}
      <div className="sw-chiptrack shrink-0 !gap-0.5 !p-0.5">
        {(["day", "month", "year"] as Mode[]).map((m) => (
          <button
            key={m}
            className="sw-chip !px-2 !py-0.5 !text-[11px]"
            data-active={mode === m}
            onClick={() => setMode(m)}
          >
            {t(`timeline.${m}`)}
          </button>
        ))}
      </div>

      {/* month scrubber */}
      <div
        className="relative flex-1 min-w-0 h-7 cursor-pointer select-none"
        onClick={pick}
      >
        <div className="absolute inset-0 flex">
          {Array.from({ length: 12 }).map((_, m) => (
            <div key={m} className="flex-1 flex flex-col items-center min-w-0">
              <div className="w-px h-1.5 bg-[var(--sw-muted)] opacity-60" />
              <span
                className={`sw-label text-[10px] mt-0.5 truncate ${
                  KEY_MONTHS.has(m) ? "" : "hidden md:block"
                }`}
              >
                {monthName(m)}
              </span>
            </div>
          ))}
        </div>
        <div
          className="absolute top-0 bottom-1.5 w-px bg-[var(--sw-ink)]"
          style={{ left: `${cursorPct}%` }}
        />
      </div>

      {/* play — hidden on mobile */}
      <button
        onClick={() => setPlaying((p) => !p)}
        className="hidden md:inline-flex items-center justify-center shrink-0 w-7 h-7 rounded-md bg-[var(--sw-chrome-bg)] border-[0.5px] border-hairline text-ink text-[10px]"
        aria-label={playing ? t("timeline.pause") : t("timeline.play")}
      >
        {playing ? "❚❚" : "▶"}
      </button>

      {/* today — hidden on mobile */}
      <button
        onClick={() => {
          setMonth(new Date().getMonth());
          setPlaying(false);
        }}
        className="hidden md:inline-flex items-center justify-center shrink-0 h-7 px-2.5 rounded-md bg-[var(--sw-chrome-bg)] border-[0.5px] border-hairline sw-label !text-[11px] text-ink"
      >
        {t("timeline.today")}
      </button>
    </div>
  );
}
