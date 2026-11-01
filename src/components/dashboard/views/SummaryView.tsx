"use client";

// Σύνοψη: the page. The filtered time-set on the map, ranked, then charted,
// in one scroll. The filter rail beside it is what all three answer to; the
// one way onward is the Χρονογραμμή button on the map.
//
// The map at the top is not a second map: this overlay leaves its top
// transparent and lets pointer events through, so the one map underneath
// (showing each place's aggregate, see DashboardShell's summaryFrame) is
// seen and dragged through the cutout, and scrolls out of sight as the
// ranking comes up.

import { memo, useEffect, useRef } from "react";
import { Play } from "lucide-react";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";
import MetricMention from "../MetricMention";
import type { AggKey } from "@/lib/dashboard/metrics";
import type { DashboardFilters } from "@/lib/dashboard/filters";
import type { SensorMeta } from "../SensorLayer";
import Leaderboard from "./Leaderboard";
import ChartsView from "./ChartsView";
import { devRenderCount } from "@/lib/dashboard/devtools";


function SummaryView({
  placingPin,
  onOpenTimeline,
  aggData,
  aggStale,
  filterQualifiers,
  aggQuery,
  metric,
  sensors,
  filters,
  domainStartMs,
  nowMs,
  onSensorClick,
  onMetricRefHover,
}: {
  /** A pin is being placed on the map: the cutout scrolls back into view. */
  placingPin: boolean;
  onOpenTimeline: () => void;
  aggData: Record<string, Record<AggKey, number> & { n: number }> | null;
  /** The filters moved and the ranking for them has not landed yet. */
  aggStale: boolean;
  /** The filter sentence's qualifiers: what the ranking covers. */
  filterQualifiers: string;
  aggQuery: string;
  metric: AggKey;
  sensors: SensorMeta[];
  filters: DashboardFilters;
  domainStartMs: number;
  nowMs: number;
  onSensorClick: (id: string) => void;
  onMetricRefHover?: (on: boolean) => void;
}) {
  devRenderCount("SummaryView");
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (placingPin) scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [placingPin]);
  return (
    <div ref={scrollRef} className="pointer-events-none absolute inset-0 z-10 overflow-y-auto">
      {/* the cutout: the map underneath, with what it shows said in a chip.
          Its size is mirrored in DashboardShell's viewPadding. */}
      <div className="relative h-[46vh] min-h-[16rem]">
        {/* onward: the same map, minute by minute */}
        <button
          type="button"
          onClick={onOpenTimeline}
          className="pointer-events-auto absolute right-3 top-3 flex h-11 items-center gap-2 rounded-xl bg-ink pl-3.5 pr-4 text-[14px] font-semibold tracking-tight text-white shadow-[0_2px_16px_-4px_rgb(45_49_66/0.35)] transition-colors hover:bg-ink/90 md:right-4 md:top-4"
        >
          <Play className="size-3.5" fill="currentColor" />
          {tr.views.timeline}
        </button>
        {/* Stacks on a phone, one line from md up. */}
        <div className="pointer-events-auto absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-col gap-0.5 rounded-lg border bg-card/95 px-3 py-1.5 text-[11.5px] shadow-sm backdrop-blur-sm md:flex-row md:items-center md:gap-1.5">
          <span className="shrink-0 font-semibold text-foreground">{tr.summary.mapTitle}</span>
          <span className="text-muted-foreground md:truncate">
            <span className="hidden md:inline">· </span>
            <MetricMention metric={metric} onHover={onMetricRefHover} /> · {filterQualifiers}
          </span>
        </div>
      </div>
      <div className="pointer-events-auto border-t bg-background pt-6">
        <Leaderboard
          embedded
          stale={aggStale}
          scope={filterQualifiers}
          aggData={aggData}
          metric={metric}
          sensors={sensors}
          onSensorClick={onSensorClick}
          onMetricRefHover={onMetricRefHover}
        />
        <div className="mx-auto my-6 h-px max-w-4xl bg-border" />
        <ChartsView
          embedded
          aggQuery={aggQuery}
          metric={metric}
          filters={filters}
          domainStartMs={domainStartMs}
          nowMs={nowMs}
          onMetricRefHover={onMetricRefHover}
        />
      </div>
    </div>
  );
}

export default memo(SummaryView);
