"use client";

// The filter composer: days × hours × months (locations later). At the top,
// a generated sentence states what the filters currently select, with the
// selected data volume beneath it — the filters' "receipt".

import { memo, useMemo } from "react";
import { dashboardStrings as tr, LOCALE } from "@/lib/strings/dashboard";
import Link from "next/link";
import { CalendarPlus, MapPin, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AGG_KEYS, type AggKey } from "@/lib/dashboard/metrics";
import {
  hasAnyMatch,
  HOUR_PRESET_RANGES,
  isUnfiltered,
  periodStartMs,
  selectedDurationMs,
  type DashboardFilters,
  type DateRange,
  type DayGroup,
  type HourPreset,
  type PeriodId,
  type TimeSegment,
  withinLocations,
} from "@/lib/dashboard/filters";
import { ATHENS_TZ } from "@/lib/dashboard/time";
import { summarySentence } from "@/lib/dashboard/summary";
import RangePicker from "./rail/RangePicker";
import AddressSearch from "./rail/AddressSearch";
import type { SensorMeta } from "./SensorLayer";
import { devRenderCount } from "@/lib/dashboard/devtools";

export interface FilterRailProps {
  filters: DashboardFilters;
  segments: TimeSegment[];
  /** Oldest data instant — BEFORE any period narrowing. */
  dataStartMs: number;
  nowMs: number;
  /** Fleet size, for the measurement-count estimate (fallback until the
   *  sensor list arrives). */
  sensorCount: number;
  /** Fleet metadata — coordinates drive the location-aware receipt. */
  sensors: SensorMeta[];
  metric: AggKey;
  onMetricChange: (m: AggKey) => void;
  onChange: (filters: DashboardFilters) => void;
  /** Pin-placement mode is armed (the map waits for a click). */
  placingPin: boolean;
  onTogglePlacing: () => void;
  onAddPin: (lng: number, lat: number, label: string) => void;
  /** A metric mention elsewhere in the app is hovered — light the picker. */
  metricGlow?: boolean;
  /** The frame span on display (map + instants only): the super-title. */
  snapshotLive?: boolean;
  snapshotStartMs?: number | null;
  snapshotEndMs?: number | null;
}

const snapshotTimeFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ATHENS_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const snapshotDateFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ATHENS_TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const PERIODS: PeriodId[] = ["24h", "7d", "30d"];
const DAY_GROUPS: DayGroup[] = ["weekend", "weekday"];
const HOUR_PRESETS: HourPreset[] = ["day", "evening", "night", "peak"];

const CHIP =
  "rounded-md border-0 bg-secondary/60 text-foreground/75 shadow-none transition-colors hover:bg-secondary hover:text-foreground " +
  "data-[state=on]:bg-sound/15 data-[state=on]:text-foreground data-[state=on]:inset-ring data-[state=on]:inset-ring-sound/40 " +
  "disabled:pointer-events-none disabled:bg-transparent disabled:text-muted-foreground/35 disabled:opacity-100";

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

/** "15 Μαΐ – 20 Μαΐ 2026" (endMs is exclusive: display the last included day). */
function formatRange(r: DateRange): string {
  const fmt = new Intl.DateTimeFormat(LOCALE, { timeZone: ATHENS_TZ, day: "numeric", month: "short", year: "numeric" });
  const first = fmt.format(r.startMs);
  const last = fmt.format(r.endMs - 1);
  return first === last ? first : `${fmt.format(r.startMs).replace(/ \d{4}$/, "")} – ${last}`;
}

function FilterRail(p: FilterRailProps) {  devRenderCount("FilterRail");

  const locale = LOCALE;
  const unfiltered = isUnfiltered(p.filters);
  const nowMin = Math.floor(p.nowMs / 60_000) * 60_000;

  // An option is selectable only if turning it ON would still match some
  // instant (e.g. "weekdays" dies inside a last-24h window on a Sunday).
  // hasAnyMatch short-circuits on the first matching day, so this is cheap.
  const viability = useMemo(() => {
    const test = (next: DashboardFilters) =>
      hasAnyMatch(next, Math.floor(periodStartMs(next, p.dataStartMs, nowMin) / 60_000) * 60_000, nowMin);
    const f = p.filters;
    return {
      period: Object.fromEntries(
        (["24h", "7d", "30d"] as PeriodId[]).map((id) => [id, test({ ...f, period: id, ranges: [] })])
      ) as Record<PeriodId, boolean>,
      // Same-dimension chips are OR-semantics, so a candidate must be probed
      // ALONE (against the other dimensions): unioned with the current
      // selection, the existing matches would make ANY addition look viable
      // (select May -> every dataless month lights up).
      days: Object.fromEntries(
        (["weekend", "weekday"] as DayGroup[]).map((g) => [g, test({ ...f, days: new Set([g]) })])
      ) as Record<DayGroup, boolean>,
      hours: Object.fromEntries(
        HOUR_PRESETS.map((h) => [h, test({ ...f, hours: new Set([h]) })])
      ) as Record<HourPreset, boolean>,
      months: Array.from({ length: 12 }, (_, m) => test({ ...f, months: new Set([m]) })),
    };
  }, [p.filters, p.dataStartMs, nowMin]);

  const monthFmt = useMemo(() => new Intl.DateTimeFormat(locale, { timeZone: ATHENS_TZ, month: "short" }), [locale]);
  const monthLabels = useMemo(
    () => Array.from({ length: 12 }, (_, m) => monthFmt.format(Date.UTC(2026, m, 15))),
    [monthFmt]
  );

  const isSnapshot = p.snapshotStartMs != null && p.snapshotEndMs != null;
  const sentence = useMemo(
    () => summarySentence(p.filters, p.dataStartMs, nowMin, isSnapshot),
    [p.filters, p.dataStartMs, nowMin, isSnapshot]
  );

  // ~1 reading per sensor-minute over the sensors the location pins keep:
  // an honest ≈ for "how much data backs this view". Until the sensor list
  // arrives, fall back to the fleet total (never flash a false red zero).
  const matchedSensors = useMemo(() => {
    if (p.sensors.length === 0) return p.sensorCount;
    if (p.filters.locations.length === 0) return p.sensors.length;
    return p.sensors.filter((s) => withinLocations(s.longitude, s.latitude, p.filters.locations)).length;
  }, [p.sensors, p.sensorCount, p.filters.locations]);

  const receipt = useMemo(() => {
    const readings = Math.round((selectedDurationMs(p.segments) / 60_000) * matchedSensors);
    const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(readings);
    return { zero: readings === 0, text: tr.summary.receipt(compact) };
  }, [p.segments, matchedSensors, locale]);

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
          <div className="min-w-0">
            {p.snapshotStartMs != null && p.snapshotEndMs != null && (
              <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold text-sound">
                {p.snapshotLive && (
                  <span className="relative flex size-1.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sound opacity-60" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-sound" />
                  </span>
                )}
                <span className="truncate tabular-nums">
                  {snapshotDateFmt.format(p.snapshotEndMs)} · {snapshotTimeFmt.format(p.snapshotStartMs)}–
                  {snapshotTimeFmt.format(p.snapshotEndMs)}
                </span>
              </div>
            )}
            <p className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">{sentence.title}</p>
            <p className="mt-0.5 text-[12px] leading-snug text-foreground/75">{sentence.qualifiers}</p>
          </div>
          {!unfiltered && (
            <Button
              variant="ghost"
              size="icon"
              className="-mr-1.5 -mt-1 size-7 shrink-0 text-muted-foreground"
              aria-label={tr.reset}
              onClick={() => p.onChange({ period: null, days: new Set(), hours: new Set(), months: new Set(), ranges: [], locations: [] })}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs tabular-nums text-muted-foreground">
          {receipt.zero ? (
            <span className="font-semibold" style={{ color: "var(--sw-loud)" }}>
              {tr.summary.zeroMeasurements}
            </span>
          ) : (
            receipt.text
          )}
          {" · "}
          {/* the metric every view is computed with — click to change it */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={tr.aggregations[p.metric].hint}
                className={cn(
                  "inline-flex items-baseline gap-0.5 rounded-[3px] border-b border-dotted border-muted-foreground/60 font-medium text-foreground/80 transition-all hover:border-sound hover:text-foreground",
                  p.metricGlow && "-mx-1 border-sound bg-sound/15 px-1 text-foreground"
                )}
              >
                {tr.aggregations[p.metric].label.toLowerCase()}
                <ChevronDown className="size-2.5 self-center opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {AGG_KEYS.map((k) => (
                <DropdownMenuItem key={k} onSelect={() => p.onMetricChange(k)} className="flex flex-col items-start gap-0">
                  <span className={cn("text-[13px] font-medium", p.metric === k && "text-sound")}>
                    {tr.aggregations[k].label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{tr.aggregations[k].hint}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </p>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {/* period — trailing presets (one-of) OR custom date spans */}
        <section>
          <SectionLabel
            onClear={
              p.filters.period || p.filters.ranges.length > 0
                ? () => set({ period: null, ranges: [] })
                : null
            }
          >
            {tr.period.label}
          </SectionLabel>
          <div className="mb-1.5 text-[10px] text-muted-foreground">{tr.period.recent}</div>
          <ToggleGroup
            type="single"
            spacing={1}
            value={p.filters.period ?? ""}
            onValueChange={(v: string) => set({ period: (v || null) as PeriodId | null, ranges: [] })}
            className="w-full"
          >
            {PERIODS.map((id) => (
              <ToggleGroupItem
                key={id}
                value={id}
                disabled={p.filters.period !== id && !viability.period[id]}
                className={cn("flex-1 text-[13px]", CHIP)}
              >
                {tr.period[id]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {p.filters.ranges.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-1">
              {p.filters.ranges.map((r, i) => (
                <li key={`${r.startMs}:${r.endMs}`} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                  <CalendarPlus className="size-3.5 shrink-0 text-sound" />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium tabular-nums">{formatRange(r)}</span>
                  <button
                    type="button"
                    aria-label={tr.locations.remove}
                    onClick={() => set({ ranges: p.filters.ranges.filter((_, j) => j !== i) })}
                    className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <RangePicker
            dataStartMs={p.dataStartMs}
            nowMs={p.nowMs}
            onAdd={(r) => set({ ranges: [...p.filters.ranges, r], period: null })}
          />
        </section>

        {/* days */}
        <section>
          <SectionLabel onClear={p.filters.days.size > 0 ? () => set({ days: new Set() }) : null}>{tr.days.label}</SectionLabel>
          <ToggleGroup
            type="multiple"
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
                className={cn("flex-1 text-[13px]", CHIP)}
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
            type="multiple"
            spacing={1}
            value={[...p.filters.hours]}
            onValueChange={(v: string[]) => set({ hours: new Set(v as HourPreset[]) })}
            className="grid w-full grid-cols-2 gap-1"
          >
            {HOUR_PRESETS.map((h) => (
              <ToggleGroupItem
                key={h}
                value={h}
                disabled={!p.filters.hours.has(h) && !viability.hours[h]}
                className={cn("h-auto flex-col gap-0 py-1.5", CHIP)}
              >
                <span className="text-[13px] leading-tight">{tr.hours[h]}</span>
                <span className="text-[9.5px] tabular-nums leading-tight text-muted-foreground">
                  {HOUR_PRESET_RANGES[h]
                    .map(([s, e]) => `${String(s).padStart(2, "0")}–${String(e).padStart(2, "0")}`)
                    .join(" · ")}
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
                  data-state={on ? "on" : "off"}
                  className={cn("py-1.5 text-[11px] font-medium capitalize", CHIP)}
                >
                  {label.replace(".", "")}
                </button>
              );
            })}
          </div>
        </section>

        {/* locations: map pins with a radius each */}
        <section>
          <SectionLabel onClear={p.filters.locations.length > 0 ? () => set({ locations: [] }) : null}>
            {tr.locations.label}
          </SectionLabel>
          {p.filters.locations.length > 0 && (
            <ul className="mb-1.5 flex flex-col gap-1">
              {p.filters.locations.map((pin, i) => {
                const hasSensors =
                  p.sensors.length === 0 || p.sensors.some((s) => withinLocations(s.longitude, s.latitude, [pin]));
                return (
                <li key={`${pin.lng}:${pin.lat}`} className="rounded-md border px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <MapPin className="size-3.5 shrink-0 text-sound" />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                    {pin.label ?? <span className="font-normal text-muted-foreground">{tr.locations.resolving}</span>}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        title={tr.locations.radius}
                        className="shrink-0 border-b border-dotted border-muted-foreground/60 text-[10.5px] tabular-nums text-muted-foreground transition-colors hover:border-sound hover:text-foreground"
                      >
                        {pin.radiusM >= 1000 ? `${pin.radiusM / 1000} χλμ` : `${pin.radiusM} μ`}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-24">
                      {[250, 500, 1000, 2000].map((r) => (
                        <DropdownMenuItem
                          key={r}
                          onClick={() =>
                            set({ locations: p.filters.locations.map((q, j) => (j === i ? { ...q, radiusM: r } : q)) })
                          }
                          className={cn("text-xs tabular-nums", r === pin.radiusM && "font-semibold text-sound")}
                        >
                          {r >= 1000 ? `${r / 1000} χλμ` : `${r} μ`}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button
                    type="button"
                    aria-label={tr.locations.remove}
                    onClick={() => set({ locations: p.filters.locations.filter((_, j) => j !== i) })}
                    className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </div>
                {!hasSensors && (
                  <p className="mt-1 pl-[1.375rem] text-[10px] leading-snug" style={{ color: "var(--sw-loud)" }}>
                    {tr.locations.noSensors}
                  </p>
                )}
                </li>
                );
              })}
            </ul>
          )}
          <AddressSearch onPick={p.onAddPin} placing={p.placingPin} onTogglePlacing={p.onTogglePlacing} />
        </section>
      </div>

      {/* footer */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t px-5 py-3 text-[10.5px] text-muted-foreground/70">
        {([tr.footer.about, tr.footer.privacy, tr.footer.terms, tr.footer.api] as string[]).map((label) => (
          <span key={label} className="cursor-default" title={tr.footer.soon}>
            {label}
          </span>
        ))}
        <Link href="/status" className="font-medium text-muted-foreground transition-colors hover:text-foreground">
          {tr.footer.status}
        </Link>
      </div>
    </div>
  );
}

// The shell ticks every second; the rail only needs minute-precision inputs.
export default memo(FilterRail);
