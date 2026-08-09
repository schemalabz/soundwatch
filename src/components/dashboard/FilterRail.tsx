"use client";

// The filter composer: days × hours × months (locations later). At the top,
// a generated sentence states what the filters currently select, with the
// selected data volume beneath it — the filters' "receipt".

import { useMemo } from "react";
import { dashboardStrings as tr, LOCALE } from "@/lib/strings/dashboard";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import {
  HOUR_PRESET_RANGES,
  isUnfiltered,
  selectedDurationMs,
  type DashboardFilters,
  type DayGroup,
  type HourPreset,
  type TimeSegment,
} from "@/lib/dashboard/filters";
import { ATHENS_TZ } from "@/lib/dashboard/time";

export interface FilterRailProps {
  filters: DashboardFilters;
  segments: TimeSegment[];
  rangeStartMs: number;
  nowMs: number;
  onChange: (filters: DashboardFilters) => void;
}

const DAY_GROUPS: DayGroup[] = ["weekend", "weekday"];
const HOUR_PRESETS: HourPreset[] = ["day", "evening", "night"];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</div>
  );
}

export default function FilterRail(p: FilterRailProps) {
  const locale = LOCALE;
  const unfiltered = isUnfiltered(p.filters);

  const monthFmt = useMemo(() => new Intl.DateTimeFormat(locale, { timeZone: ATHENS_TZ, month: "short" }), [locale]);
  const monthLabels = useMemo(
    () => Array.from({ length: 12 }, (_, m) => monthFmt.format(Date.UTC(2026, m, 15))),
    [monthFmt]
  );

  // Which months actually have data in range (approx by month index present).
  const monthsInRange = useMemo(() => {
    const present = new Set<number>();
    const d = new Date(p.rangeStartMs);
    const cur = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    while (cur.getTime() < p.nowMs) {
      present.add(cur.getUTCMonth());
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
    return present;
  }, [p.rangeStartMs, p.nowMs]);

  const summary = useMemo(() => {
    if (unfiltered) return tr.summary.everything;
    const parts: string[] = [];
    if (p.filters.days.size === 1) {
      parts.push(tr.summary[[...p.filters.days][0]]);
    }
    if (p.filters.hours.size > 0 && p.filters.hours.size < 3) {
      parts.push([...p.filters.hours].map((h) => tr.hours[h].toLowerCase()).join(" + "));
    }
    if (p.filters.months.size > 0 && p.filters.months.size < 12) {
      const sorted = [...p.filters.months].sort((a, b) => a - b);
      parts.push(sorted.map((m) => monthLabels[m]).join(", "));
    }
    return parts.join(" · ");
  }, [unfiltered, p.filters, monthLabels]);

  const receipt = useMemo(() => {
    const hours = Math.round(selectedDurationMs(p.segments) / 3600_000);
    const spanDays = Math.round((p.nowMs - p.rangeStartMs) / 86_400_000);
    return tr.summary.receipt(hours.toLocaleString(locale), spanDays);
  }, [p.segments, p.nowMs, p.rangeStartMs, locale]);

  const set = (partial: Partial<DashboardFilters>) => p.onChange({ ...p.filters, ...partial });

  return (
    <div className="flex h-full flex-col">
      {/* wordmark */}
      <div className="flex items-baseline gap-0.5 px-5 pb-5 pt-5">
        <span className="text-[17px] font-bold tracking-tight text-foreground">soundwatch</span>
        <span className="size-[5px] translate-y-[-1px] rounded-full bg-sound" />
      </div>

      {/* summary */}
      <div className="border-y bg-card px-5 py-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[15px] font-medium leading-snug text-foreground">{summary}</p>
          {!unfiltered && (
            <Button
              variant="ghost"
              size="icon"
              className="-mr-1.5 -mt-1 size-7 shrink-0 text-muted-foreground"
              aria-label={tr.reset}
              onClick={() => p.onChange({ days: new Set(), hours: new Set(), months: new Set() })}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs tabular-nums text-muted-foreground">{receipt}</p>
      </div>

      <div className="flex-1 space-y-7 overflow-y-auto px-5 py-6">
        {/* days */}
        <section>
          <SectionLabel>{tr.days.label}</SectionLabel>
          <ToggleGroup
            type="multiple" variant="outline"
            spacing={1}
            value={[...p.filters.days]}
            onValueChange={(v: string[]) => set({ days: new Set(v as DayGroup[]) })}
            className="w-full"
          >
            {DAY_GROUPS.map((g) => (
              <ToggleGroupItem
                key={g}
                value={g}
                className="flex-1 data-[state=on]:bg-sound/12 data-[state=on]:text-foreground data-[state=on]:inset-ring data-[state=on]:inset-ring-sound/50"
              >
                {tr.days[g]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </section>

        {/* hours */}
        <section>
          <SectionLabel>{tr.hours.label}</SectionLabel>
          <ToggleGroup
            type="multiple" variant="outline"
            spacing={1}
            value={[...p.filters.hours]}
            onValueChange={(v: string[]) => set({ hours: new Set(v as HourPreset[]) })}
            className="w-full"
          >
            {HOUR_PRESETS.map((h) => (
              <ToggleGroupItem
                key={h}
                value={h}
                className="flex-1 flex-col gap-0 py-1.5 data-[state=on]:bg-sound/12 data-[state=on]:text-foreground data-[state=on]:inset-ring data-[state=on]:inset-ring-sound/50"
              >
                <span className="text-[13px] leading-tight">{tr.hours[h]}</span>
                <span className="text-[9.5px] tabular-nums leading-tight text-muted-foreground">
                  {String(HOUR_PRESET_RANGES[h][0]).padStart(2, "0")}–{String(HOUR_PRESET_RANGES[h][1]).padStart(2, "0")}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </section>

        {/* months */}
        <section>
          <SectionLabel>{tr.months.label}</SectionLabel>
          <div className="grid grid-cols-6 gap-1">
            {monthLabels.map((label, m) => {
              const hasData = monthsInRange.has(m);
              const on = p.filters.months.has(m);
              return (
                <button
                  key={m}
                  type="button"
                  disabled={!hasData}
                  aria-pressed={on}
                  onClick={() => {
                    const next = new Set(p.filters.months);
                    if (on) next.delete(m);
                    else next.add(m);
                    set({ months: next });
                  }}
                  className={cn(
                    "rounded-md border py-1.5 text-[11px] font-medium capitalize transition-colors",
                    on
                      ? "border-sound/50 bg-sound/12 text-foreground"
                      : "border-transparent bg-secondary text-muted-foreground hover:text-foreground",
                    !hasData && "cursor-default opacity-30 hover:text-muted-foreground"
                  )}
                >
                  {label.replace(".", "")}
                </button>
              );
            })}
          </div>
        </section>

        {/* locations — coming soon */}
        <section>
          <SectionLabel>{tr.locations.label}</SectionLabel>
          <div className="rounded-md border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
            {tr.locations.soon}
          </div>
        </section>
      </div>
    </div>
  );
}
