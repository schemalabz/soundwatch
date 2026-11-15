"use client";

// The leaderboard: every public sensor ranked by the rail-selected metric
// over the filtered time-set. The bar is the story, colored by the same level
// ramp as the map circles, so the two views read as one system.
//
// The bar's scale is FIXED per metric, not stretched between the list's own
// quietest and loudest: stretched, a filter that lowers every place by 5 dB
// (nights) redrew exactly the same bars, and the filters looked broken.

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";
import { levelColor, paletteStops } from "@/lib/dashboard/levels";
import { fmtDb, fmtInt } from "@/lib/dashboard/format";
import { COMPARE_COLORS, MAX_COMPARE } from "@/lib/dashboard/compare";
import type { DashboardFilters } from "@/lib/dashboard/filters";
import type { AggKey } from "@/lib/dashboard/metrics";
import PlaceDetail from "./PlaceDetail";
import type { SensorMeta } from "../SensorLayer";
import MetricMention from "../MetricMention";
import ScopeChip from "../ScopeChip";
import { devRenderCount } from "@/lib/dashboard/devtools";

/** The ranking opens on its head; the rest is one tap away. */
const TOP_N = 5;

/** Device-dB the bar spans, per metric: Lmax is one frame's peak and sits
 *  far above the others. Arbitrary visual anchors, like the map's ramp. */
const BAR_SCALE: Record<AggKey, [number, number]> = {
  laeq: [40, 85],
  l50: [40, 85],
  l10: [40, 85],
  l90: [40, 85],
  lmax: [70, 120],
};

/** The + at the end of a row: adds the place to the comparison below, and
 *  once added wears that place's colour there. */
function CompareToggle({ name, slot, full, onToggle }: { name: string; slot: number; full: boolean; onToggle: () => void }) {
  const on = slot >= 0;
  const label = on ? tr.compare.remove(name) : full ? tr.compare.full(MAX_COMPARE) : tr.compare.add(name);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={!on && full}
      onClick={onToggle}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-md border transition-colors max-md:size-10",
        on ? "border-transparent text-white" : "bg-card text-muted-foreground hover:border-slate hover:text-foreground",
        !on && full && "pointer-events-none opacity-30"
      )}
      style={on ? { backgroundColor: COMPARE_COLORS[slot % COMPARE_COLORS.length] } : undefined}
    >
      {on ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
    </button>
  );
}

function Leaderboard({
  aggData,
  metric,
  sensors,
  onSensorClick,
  onMetricRefHover,
  embedded,
  stale,
  scope,
  compareIds,
  onCompareToggle,
  selectedId,
  onSelect,
  aggQuery,
  filters,
  onGoToMap,
}: {
  aggData: Record<string, Record<AggKey, number> & { n: number }> | null;
  metric: AggKey;
  sensors: SensorMeta[];
  onSensorClick: (id: string) => void;
  onMetricRefHover?: (on: boolean) => void;
  /** Inside the summary's own scroll: no overlay, no top inset. */
  embedded?: boolean;
  /** The filters changed and their ranking is on its way. */
  stale?: boolean;
  /** What the ranking covers, in the rail's words: «τις νύχτες, μόνο ΣΚ». */
  scope?: string;
  /** The places in the comparison; with onCompareToggle, each row gets a +. */
  compareIds?: readonly string[];
  onCompareToggle?: (id: string) => void;
  /** The place opened in its row (also set by a click on its circle). */
  selectedId?: string | null;
  /** With aggQuery and filters: a row opens the place's period detail in
   *  place, instead of handing the click to onSensorClick. */
  onSelect?: (id: string | null) => void;
  aggQuery?: string;
  filters?: DashboardFilters;
  /** «Show this place on the moment's map». */
  onGoToMap?: (id: string) => void;
}) {
  devRenderCount("Leaderboard");
  const [expanded, setExpanded] = useState(false);
  const meta = useMemo(() => new Map(sensors.map((s) => [s.id, s])), [sensors]);
  const stops = useMemo(() => paletteStops(), []);

  const rows = useMemo(() => {
    if (!aggData) return null;
    return Object.entries(aggData)
      .map(([id, v]) => ({ id, value: v[metric], n: v.n }))
      .sort((a, b) => b.value - a.value);
  }, [aggData, metric]);

  // A place opened from its circle may sit below the fold of the list: the
  // list opens to show it.
  const selectedIndex = rows && selectedId ? rows.findIndex((r) => r.id === selectedId) : -1;
  const showAll = expanded || selectedIndex >= TOP_N;
  const visibleRows = useMemo(() => {
    if (!rows) return [];
    return showAll ? rows : rows.slice(0, TOP_N);
  }, [rows, showAll]);
  const inline = onSelect != null && aggQuery != null && filters != null;
  const selectedRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (selectedIndex >= 0) selectedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId, selectedIndex]);
  const compareFull = (compareIds?.length ?? 0) >= MAX_COMPARE;
  const hiddenCount = rows ? Math.max(0, rows.length - TOP_N) : 0;
  const [lo, hi] = BAR_SCALE[metric];
  const barFraction = (v: number) => 0.04 + 0.96 * Math.min(1, Math.max(0, (v - lo) / (hi - lo)));

  return (
    <div className={embedded ? "" : "absolute inset-0 z-10 overflow-y-auto bg-background"}>
      <div className={embedded ? "mx-auto max-w-2xl px-6 pb-4 md:px-8" : "mx-auto max-w-2xl px-6 pb-16 pt-[4.5rem] md:px-8"}>
        <h2 className="text-[15px] font-semibold tracking-tight">{tr.board.title}</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {tr.board.subtitlePrefix}
          <MetricMention metric={metric} onHover={onMetricRefHover} />
          {scope && (
            <>
              {" · "}
              <ScopeChip fallback={scope} />
            </>
          )}
        </p>

        {rows == null ? (
          <div className="mt-6 flex flex-col gap-2">
            {Array.from({ length: TOP_N }, (_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-md bg-silver/30" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-8 text-center text-[12px] text-muted-foreground">{tr.board.empty}</p>
        ) : (
          <ol className={cn("mt-5 transition-opacity duration-200", stale && "opacity-45")} aria-busy={stale || undefined}>
            {visibleRows.map((row, i) => {
              const m = meta.get(row.id);
              const color = levelColor(row.value, stops);
              const open = inline && row.id === selectedId;
              return (
                // Open, the row and its detail are ONE raised card: the row is
                // its header (bold name, chevron up), the detail its body.
                <li
                  key={row.id}
                  ref={open ? selectedRef : undefined}
                  className={cn("scroll-mt-24", open && "-mx-2 my-2 overflow-hidden rounded-xl border border-foreground/20 bg-card shadow-md")}
                >
                  <div className={cn("flex items-center gap-1", open && "border-b bg-silver/20 px-2 py-1")}>
                  <button
                    type="button"
                    aria-expanded={inline ? open : undefined}
                    onClick={() => (inline ? onSelect(open ? null : row.id) : onSensorClick(row.id))}
                    className={cn(
                      "group grid min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors sm:gap-3",
                      inline
                        ? "grid-cols-[1.75rem_minmax(0,1fr)_3.25rem_auto_0.875rem] sm:grid-cols-[2rem_minmax(7rem,11rem)_1fr_auto_0.875rem]"
                        : "grid-cols-[1.75rem_minmax(0,1fr)_4.5rem_auto] sm:grid-cols-[2rem_minmax(7rem,11rem)_1fr_auto]",
                      !open && "hover:bg-silver/20"
                    )}
                  >
                    <span
                      className={
                        i < 3
                          ? "text-[15px] font-bold tabular-nums text-sound"
                          : "text-[12px] font-medium tabular-nums text-muted-foreground"
                      }
                    >
                      {i + 1}
                    </span>
                    <span className="truncate">
                      <span className={cn("block truncate text-[12.5px] leading-tight text-foreground", open ? "font-bold" : "font-medium")}>
                        {m?.name ?? row.id.slice(0, 8)}
                      </span>
                      <span className="block truncate text-[9.5px] leading-tight text-muted-foreground">
                        {tr.board.measurements(fmtInt(row.n))}
                      </span>
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-silver/25">
                      <span
                        className="block h-full rounded-full transition-[width] duration-500"
                        style={{ width: `${barFraction(row.value) * 100}%`, backgroundColor: color }}
                      />
                    </span>
                    <span className="w-16 text-right">
                      <span className="text-[13.5px] font-semibold tabular-nums" style={{ color }}>
                        {fmtDb(row.value)}
                      </span>
                      <span className="ml-0.5 text-[9px] text-muted-foreground">dB</span>
                    </span>
                    {inline && (
                      <ChevronDown
                        aria-hidden="true"
                        className={cn("size-3.5 transition-transform duration-200", open ? "rotate-180 text-foreground" : "text-muted-foreground/60 group-hover:text-foreground")}
                      />
                    )}
                  </button>
                  {onCompareToggle && <CompareToggle name={m?.name ?? row.id.slice(0, 8)} slot={compareIds?.indexOf(row.id) ?? -1} full={compareFull} onToggle={() => onCompareToggle(row.id)} />}
                  </div>
                  {open && (
                    <PlaceDetail
                      sensorId={row.id}
                      name={m?.name ?? row.id.slice(0, 8)}
                      address={m?.address ?? null}
                      rank={i + 1}
                      total={rows.length}
                      aggQuery={aggQuery}
                      metric={metric}
                      filters={filters}
                      inCompare={compareIds?.includes(row.id) ?? false}
                      compareFull={compareFull}
                      onCompareToggle={onCompareToggle ? () => onCompareToggle(row.id) : undefined}
                      onGoToMap={onGoToMap ? () => onGoToMap(row.id) : undefined}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {hiddenCount > 0 && (
          <button
            type="button"
            aria-expanded={showAll}
            onClick={() => {
              // Folding the list away closes a place opened below the fold.
              if (showAll && selectedIndex >= TOP_N) onSelect?.(null);
              setExpanded(!showAll);
            }}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-dashed text-[12px] font-medium text-foreground/80 transition-colors hover:bg-silver/20 hover:text-foreground"
          >
            {showAll ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {showAll ? tr.board.showLess : tr.board.showAll(hiddenCount)}
          </button>
        )}
      </div>
    </div>
  );
}

// Re-renders only when aggregate data / metric / fleet change.
export default memo(Leaderboard);
