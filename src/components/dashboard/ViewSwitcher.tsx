"use client";

import { memo } from "react";

// Χάρτης / Σύνοψη — the two lenses on the data. The map is a moment (the
// timebar is its only time control); the summary is the filtered time-set,
// ranked and charted, with the filter rail beside it.

import { ChartSpline, Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";
import { devRenderCount } from "@/lib/dashboard/devtools";

export type DashboardView = "map" | "summary";

const VIEWS: { key: DashboardView; icon: typeof MapIcon }[] = [
  { key: "map", icon: MapIcon },
  { key: "summary", icon: ChartSpline },
];

function ViewSwitcher({
  view,
  compact,
  onViewChange,
}: {
  view: DashboardView;
  compact?: boolean;
  onViewChange: (v: DashboardView) => void;
}) {
  devRenderCount("ViewSwitcher");
  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center rounded-xl border bg-card/95 shadow-[0_2px_16px_-4px_rgb(45_49_66/0.18)] backdrop-blur-sm",
        compact ? "gap-2.5 px-2.5 py-1" : "gap-4 px-3.5 py-1.5"
      )}
      role="tablist"
    >
      {VIEWS.map(({ key, icon: Icon }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={view === key}
          aria-label={tr.views[key]}
          onClick={() => onViewChange(key)}
          className={cn(
            "flex items-center gap-1.5 border-b-2 pb-0.5 pt-1 font-medium tracking-tight transition-colors",
            compact ? "text-[10px]" : "text-[11.5px]",
            view === key
              ? "border-sound text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="size-3.5" />
          {!compact && tr.views[key]}
        </button>
      ))}
    </div>
  );
}

// Static between view changes.
export default memo(ViewSwitcher);
