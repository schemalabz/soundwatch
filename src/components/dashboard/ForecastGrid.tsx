"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import SectionHeader from "@/components/dashboard/SectionHeader";
import { forecastData, PERIODS, type Period } from "@/lib/mockData";
import { scaleColor } from "@/lib/scale";

const DAY_KEYS = ["today", "sun", "mon", "tue", "wed", "thu", "fri"];
const GRID = "76px repeat(7, minmax(0, 1fr))";

export default function ForecastGrid() {
  const t = useTranslations("dashboard");
  const [period, setPeriod] = useState<Period>("day");
  const rows = forecastData(period);

  return (
    <section className="sw-section pb-12">
      <SectionHeader
        title={t("forecast")}
        info
        right={
          <div className="sw-chiptrack">
            {PERIODS.map((p) => (
              <button
                key={p}
                className="sw-chip"
                data-active={period === p}
                onClick={() => setPeriod(p)}
              >
                {t(`periods.${p}`)}
              </button>
            ))}
          </div>
        }
      />

      <div className="px-6 pb-5 mt-7">
        <div className="grid items-center pb-2" style={{ gridTemplateColumns: GRID }}>
          <span />
          {DAY_KEYS.map((d) => (
            <div key={d} className="flex items-center justify-center sw-label text-xs">
              {t(`days.${d}`)}
            </div>
          ))}
        </div>

        {rows.map(({ key, days }) => (
          <div
            key={key}
            className="grid items-center py-2.5"
            style={{ gridTemplateColumns: GRID }}
          >
            <span className="font-light text-xs text-ink tracking-[0.6px]">
              {t(`sources.${key}`)}
            </span>
            {days.map((v, i) => (
              <div key={i} className="flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <circle cx="9" cy="9" r={1.4 + v * 1.5} fill={scaleColor(v)} />
                </svg>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
