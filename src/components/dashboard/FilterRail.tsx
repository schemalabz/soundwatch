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
  hasAnyMatch,
  HOUR_PRESET_RANGES,
  isUnfiltered,
  periodStartMs,
  selectedDurationMs,
  type DashboardFilters,
  type DayGroup,
  type HourPreset,
  type PeriodId,
  type TimeSegment,
} from "@/lib/dashboard/filters";
import { ATHENS_TZ } from "@/lib/dashboard/time";

export interface FilterRailProps {
  filters: DashboardFilters;
  segments: TimeSegment[];
  /** Oldest data instant — BEFORE any period narrowing. */
  dataStartMs: number;
  nowMs: number;
  onChange: (filters: DashboardFilters) => void;
}

const PERIODS: PeriodId[] = ["24h", "7d", "30d"];
const DAY_GROUPS: DayGroup[] = ["weekend", "weekday"];
const HOUR_PRESETS: HourPreset[] = ["day", "evening", "night"];

function SectionLabel({ children, onClear }: { children: React.ReactNode; onClear?: (() => void) | null }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] font-medium text-sound transition-colors hover:text-sound/70"
        >
          {tr.clear}
        </button>
      )}
    </div>
  );
}

export default function FilterRail(p: FilterRailProps) {
  const locale = LOCALE;
  const unfiltered = isUnfiltered(p.filters);
  const nowMin = Math.floor(p.nowMs / 60_000) * 60_000;
  const effectiveStartMs = periodStartMs(p.filters, p.dataStartMs, nowMin);

  // An option is selectable only if turning it ON would still match some
  // instant (e.g. "weekdays" dies inside a last-24h window on a Sunday).
  // hasAnyMatch short-circuits on the first matching day, so this is cheap.
  const viability = useMemo(() => {
    const test = (next: DashboardFilters) =>
      hasAnyMatch(next, Math.floor(periodStartMs(next, p.dataStartMs, nowMin) / 60_000) * 60_000, nowMin);
    const f = p.filters;
    return {
      period: Object.fromEntries(
        (["24h", "7d", "30d"] as PeriodId[]).map((id) => [id, test({ ...f, period: id })])
      ) as Record<PeriodId, boolean>,
      days: Object.fromEntries(
        (["weekend", "weekday"] as DayGroup[]).map((g) => [g, test({ ...f, days: new Set([...f.days, g]) })])
      ) as Record<DayGroup, boolean>,
      hours: Object.fromEntries(
        (["day", "evening", "night"] as HourPreset[]).map((h) => [h, test({ ...f, hours: new Set([...f.hours, h]) })])
      ) as Record<HourPreset, boolean>,
      months: Array.from({ length: 12 }, (_, m) => test({ ...f, months: new Set([...f.months, m]) })),
    };
  }, [p.filters, p.dataStartMs, nowMin]);

  const monthFmt = useMemo(() => new Intl.DateTimeFormat(locale, { timeZone: ATHENS_TZ, month: "short" }), [locale]);
  const monthLabels = useMemo(
    () => Array.from({ length: 12 }, (_, m) => monthFmt.format(Date.UTC(2026, m, 15))),
    [monthFmt]
  );

  const summary = useMemo(() => {
    if (unfiltered) return tr.summary.everything;
    const parts: string[] = [];
    if (p.filters.period) {
      parts.push(tr.period.summary[p.filters.period]);
    }
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
    const sentence = parts.join(" · ");
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
  }, [unfiltered, p.filters, monthLabels]);

  const receipt = useMemo(() => {
    const hours = Math.round(selectedDurationMs(p.segments) / 3600_000);
    const spanDays = Math.max(1, Math.round((p.nowMs - effectiveStartMs) / 86_400_000));
    return tr.summary.receipt(hours.toLocaleString(locale), spanDays);
  }, [p.segments, p.nowMs, effectiveStartMs, locale]);

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
              onClick={() => p.onChange({ period: null, days: new Set(), hours: new Set(), months: new Set() })}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs tabular-nums text-muted-foreground">{receipt}</p>
      </div>

      <div className="flex-1 space-y-7 overflow-y-auto px-5 py-6">
        {/* period — one-of: a single connected segmented bar */}
        <section>
          <SectionLabel onClear={p.filters.period ? () => set({ period: null }) : null}>{tr.period.label}</SectionLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={p.filters.period ?? ""}
            onValueChange={(v: string) => set({ period: (v || null) as PeriodId | null })}
            className="w-full"
          >
            {PERIODS.map((id) => (
              <ToggleGroupItem
                key={id}
                value={id}
                disabled={p.filters.period !== id && !viability.period[id]}
                className="flex-1 data-[state=on]:bg-sound/12 data-[state=on]:text-foreground data-[state=on]:inset-ring data-[state=on]:inset-ring-sound/50 disabled:opacity-35"
              >
                {tr.period[id]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </section>

        {/* days */}
        <section>
          <SectionLabel onClear={p.filters.days.size > 0 ? () => set({ days: new Set() }) : null}>{tr.days.label}</SectionLabel>
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
                disabled={!p.filters.days.has(g) && !viability.days[g]}
                className="flex-1 data-[state=on]:bg-sound/12 data-[state=on]:text-foreground data-[state=on]:inset-ring data-[state=on]:inset-ring-sound/50 disabled:opacity-35"
              >
                {tr.days[g]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </section>

        {/* hours */}
        <section>
          <SectionLabel onClear={p.filters.hours.size > 0 ? () => set({ hours: new Set() }) : null}>{tr.hours.label}</SectionLabel>
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
                disabled={!p.filters.hours.has(h) && !viability.hours[h]}
                className="flex-1 flex-col gap-0 py-1.5 data-[state=on]:bg-sound/12 data-[state=on]:text-foreground data-[state=on]:inset-ring data-[state=on]:inset-ring-sound/50 disabled:opacity-35"
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
          <SectionLabel onClear={p.filters.months.size > 0 ? () => set({ months: new Set() }) : null}>{tr.months.label}</SectionLabel>
          <div className="grid grid-cols-6 gap-1">
            {monthLabels.map((label, m) => {
              const on = p.filters.months.has(m);
              const selectable = on || viability.months[m];
              return (
                <button
                  key={m}
                  type="button"
                  disabled={!selectable}
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
                    !selectable && "cursor-default opacity-30 hover:text-muted-foreground"
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
