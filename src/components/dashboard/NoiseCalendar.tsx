"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import SectionHeader from "@/components/dashboard/SectionHeader";
import { calendarData } from "@/lib/mockData";
import { scaleColor } from "@/lib/scale";

const MONTH_TICKS = [
  { label: "Jan", left: 4.1667 },
  { label: "Mar", left: 20.8333 },
  { label: "May", left: 37.5 },
  { label: "Jul", left: 54.1667 },
  { label: "Sep", left: 70.8333 },
  { label: "Nov", left: 87.5 },
];

export default function NoiseCalendar() {
  const t = useTranslations("dashboard");
  const [span, setSpan] = useState<"3M" | "9M" | "12M">("12M");
  const rows = calendarData();

  return (
    <section className="sw-section pb-12">
      <SectionHeader
        title={t("calendar")}
        info
        right={
          <div className="sw-chiptrack">
            {(["3M", "9M", "12M"] as const).map((s) => (
              <button
                key={s}
                className="sw-chip"
                data-active={span === s}
                onClick={() => setSpan(s)}
              >
                {s}
              </button>
            ))}
          </div>
        }
      />

      <div className="px-6 pb-5 mt-7">
        {/* Month axis */}
        <div className="flex items-center mb-2">
          <div className="flex-1 relative h-[18px]">
            {MONTH_TICKS.map((m) => (
              <span
                key={m.label}
                className="absolute sw-label text-xs whitespace-nowrap"
                style={{ left: `${m.left}%`, transform: "translateX(-50%)" }}
              >
                {m.label}
              </span>
            ))}
          </div>
          <div className="w-[70px]" />
        </div>

        {/* Gradient bars */}
        <div className="flex flex-col gap-2">
          {rows.map(({ key, monthly }) => {
            const gradId = `cal-${key}`;
            return (
              <div key={key} className="flex items-center">
                <div className="flex-1 h-[3px]">
                  <svg width="100%" height="3" preserveAspectRatio="none" viewBox="0 0 100 3">
                    <defs>
                      <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                        {monthly.map((v, i) => (
                          <stop
                            key={i}
                            offset={`${(i / 11) * 100}%`}
                            stopColor={v > 0 ? scaleColor(v) : "rgb(120,120,120)"}
                            stopOpacity={v > 0 ? 1 : 0}
                          />
                        ))}
                      </linearGradient>
                    </defs>
                    <rect x="0" y="0" width="100" height="3" fill={`url(#${gradId})`} />
                  </svg>
                </div>
                <span className="w-[70px] pl-2.5 sw-label text-xs whitespace-nowrap">
                  {t(`sources.${key}`)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
