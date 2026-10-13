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
      <div className="pt-[4.5rem]">
        <Leaderboard
          embedded
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
