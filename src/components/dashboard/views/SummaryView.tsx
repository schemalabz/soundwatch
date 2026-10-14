"use client";

// Σύνοψη: the filtered time-set on the map, ranked, then charted, in one
// scroll — what used to be two lenses (Κατάταξη, Γραφήματα). The filter rail
// beside it is what all three answer to.
//
// The map at the top is not a second map: this overlay leaves its top
// transparent and lets pointer events through, so the one map underneath
// (showing each place's aggregate, see DashboardShell's summaryFrame) is
// seen and dragged through the cutout, and scrolls out of sight as the
// ranking comes up.

import { memo, useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";
import MetricMention from "../MetricMention";
import type { AggKey } from "@/lib/dashboard/metrics";
import type { DashboardFilters } from "@/lib/dashboard/filters";
import type { SensorMeta } from "../SensorLayer";
import Leaderboard from "./Leaderboard";
import ChartsView from "./ChartsView";
import { devRenderCount } from "@/lib/dashboard/devtools";


function SummaryView({
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
  // Once the content has scrolled up under the floating lens switcher, a
  // backdrop keeps it from showing through; over the map there is none.
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrolled(e.currentTarget.scrollTop > 8);
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-y-auto" onScroll={onScroll}>
      <div
        aria-hidden="true"
        className={cn(
          "sticky top-0 z-[1] h-[4.5rem] bg-gradient-to-b from-background from-60% to-transparent transition-opacity duration-200",
          scrolled ? "opacity-100" : "opacity-0"
        )}
      />
      {/* the cutout: the map underneath, with what it shows said in a chip */}
      <div className="relative -mt-[4.5rem] h-[46vh] min-h-[16rem]">
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
