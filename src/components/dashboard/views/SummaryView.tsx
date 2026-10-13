"use client";

// Σύνοψη: the filtered time-set, ranked and then charted, in one scroll —
// what used to be two lenses (Κατάταξη, Γραφήματα). The filter rail beside
// it is what both answer to; the map answers to the timebar instead.

import { memo } from "react";
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
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-background">
      {/* Room for the floating lens switcher, and a backdrop so the list
          scrolls out of sight beneath it instead of through it. */}
      <div aria-hidden="true" className="sticky top-0 z-[1] h-[4.5rem] bg-gradient-to-b from-background from-60% to-transparent" />
      <div>
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
