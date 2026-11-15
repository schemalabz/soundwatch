"use client";

import { memo } from "react";

// The two lenses on the data, named for what separates them: time. The map
// is ONE MOMENT (now, or wherever the timebar is parked); the summary is A
// PERIOD (every hour the filters keep), aggregated. Both lenses draw circles
// on the same map, so the name alone cannot carry the difference: each tab
// says, on its second line, the time it is showing right now.

import { ChartSpline, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";
import { devRenderCount } from "@/lib/dashboard/devtools";

export type DashboardView = "map" | "summary";

const VIEWS: { key: DashboardView; icon: typeof Clock3 }[] = [
  { key: "map", icon: Clock3 },
  { key: "summary", icon: ChartSpline },
];

function ViewSwitcher({
  view,
  compact,
  scope,
  live,
  onViewChange,
}: {
  view: DashboardView;
  compact?: boolean;
  /** What each lens covers right now: the moment, and the filtered period. */
  scope: Record<DashboardView, string>;
  /** The moment is the present: the map tab carries the live dot. */
  live: boolean;
  onViewChange: (v: DashboardView) => void;
}) {
  devRenderCount("ViewSwitcher");
  return (
    <div
      className={cn(
        "pointer-events-auto flex items-stretch rounded-xl border bg-card/95 p-1 shadow-[0_2px_16px_-4px_rgb(45_49_66/0.18)] backdrop-blur-sm",
        compact ? "h-11 gap-0.5" : "gap-1"
      )}
      role="tablist"
    >
      {VIEWS.map(({ key, icon: Icon }) => {
        const active = view === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${tr.views[key]} — ${scope[key]}`}
            title={tr.viewHints[key]}
            onClick={() => onViewChange(key)}
            className={cn(
              "flex items-center rounded-lg text-left transition-colors",
              // Phones: the name only, a full 40 px target. Desktop: the name
              // over the time it covers.
              compact ? "min-w-10 justify-center gap-1.5 px-2.5" : "w-[11.75rem] gap-2.5 px-3 py-1.5",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <Icon className={cn("shrink-0", compact ? "size-3.5" : "size-4")} />
            <span className="min-w-0">
              <span className={cn("block whitespace-nowrap font-semibold leading-tight tracking-tight", compact ? "text-[12px]" : "text-[13px]")}>
                {compact ? tr.viewsShort[key] : tr.views[key]}
              </span>
              {!compact && (
                <span
                  className={cn(
                    "mt-px flex items-center gap-1 text-[10.5px] leading-tight tabular-nums",
                    active ? "text-background/75" : "text-muted-foreground"
                  )}
                >
                  {key === "map" && live && <span className="size-1.5 shrink-0 rounded-full bg-sound" />}
                  <span className="truncate">{scope[key]}</span>
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Re-renders when the moment (minute-quantized) or the filters change.
export default memo(ViewSwitcher);
