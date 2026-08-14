"use client";

import { memo } from "react";

// Χάρτης / Κατάταξη / Γραφήματα — the top-level lens on the filtered data.
//
// The map lens carries a second axis (Στιγμιότυπα / Συγκεντρωτικά) that no
// other view has, so the Χάρτης tab UNFOLDS: while active, a nested mini
// scope picker slides out inside the tab, under the same sound underline —
// the shared underline is what says "one lens, two scopes". Leaving the map
// folds it back in.

import { ChartSpline, Map as MapIcon, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";
import type { BarMode } from "./Timebar";
import { devRenderCount } from "@/lib/dashboard/devtools";

export type DashboardView = "map" | "board" | "charts";

const SECONDARY: { key: Exclude<DashboardView, "map">; icon: typeof MapIcon }[] = [
  { key: "board", icon: Trophy },
  { key: "charts", icon: ChartSpline },
];

function ViewSwitcher({
  view,
  mode,
  compact,
  onViewChange,
  onModeChange,
}: {
  view: DashboardView;
  mode: BarMode;
  compact?: boolean;
  onViewChange: (v: DashboardView) => void;
  onModeChange: (m: BarMode) => void;
}) {
  devRenderCount("ViewSwitcher");
  const mapActive = view === "map";
  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center rounded-xl border bg-card/95 shadow-[0_2px_16px_-4px_rgb(45_49_66/0.18)] backdrop-blur-sm",
        compact ? "gap-2.5 px-2.5 py-1" : "gap-4 px-3.5 py-1.5"
      )}
      role="tablist"
    >
      {/* the map tab: only the label carries the underline; the fold-out
          scope picker rides alongside, unmarked */}
      <div className="flex items-center">
        <button
          type="button"
          role="tab"
          aria-selected={mapActive}
          aria-label={tr.views.map}
          onClick={() => onViewChange("map")}
          className={cn(
            "flex items-center gap-1.5 border-b-2 pb-0.5 pt-1 font-medium tracking-tight transition-colors",
            compact ? "text-[10px]" : "text-[11.5px]",
            mapActive ? "border-sound text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <MapIcon className="size-3.5" />
          {!compact && tr.views.map}
        </button>
        <div
          className={cn(
            "flex items-center overflow-hidden transition-all duration-300",
            mapActive ? "max-w-48 opacity-100" : "max-w-0 opacity-0"
          )}
        >
          <span className="mx-2 h-3 w-px shrink-0 bg-border" />
          {(["instants", "aggregate"] as BarMode[]).map((m) => (
            <button
              key={m}
              type="button"
              tabIndex={mapActive ? 0 : -1}
              aria-pressed={mode === m}
              onClick={() => onModeChange(m)}
              className={cn(
                "whitespace-nowrap font-medium transition-colors",
                compact ? "px-1 text-[9.5px]" : "px-1.5 text-[10px]",
                mode === m ? "text-sound" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tr.modes[m]}
            </button>
          ))}
        </div>
      </div>

      {SECONDARY.map(({ key, icon: Icon }) => (
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

// Static between view/mode changes.
export default memo(ViewSwitcher);
