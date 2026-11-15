"use client";

// How to read the map, on the map: the colour ramp the circles (and every
// bar and cell elsewhere) share, what the size means, and what the pill
// says. Without it a first visit sees fifty rings and no way to tell which
// way "more" runs. The numbers on the ramp are its own anchors
// (src/lib/dashboard/levels.ts): visual thresholds on an uncalibrated scale,
// which is why the caveat sits under them rather than a unit.

import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import { levelColor, paletteStops } from "@/lib/dashboard/levels";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";

function MapLegend({ className, showPills = true }: { className?: string; showPills?: boolean }) {
  const stops = useMemo(() => paletteStops(), []);
  const anchors = stops.colors.map(([db]) => db);
  const gradient = `linear-gradient(to right, ${anchors.map((db) => levelColor(db, stops)).join(", ")})`;
  return (
    <div className={cn("w-[15rem] rounded-lg border bg-card/95 px-3 py-2.5 text-[11px] shadow-sm backdrop-blur-sm", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-foreground">{tr.legend.title}</span>
        <span className="text-[10px] text-muted-foreground">{tr.legend.unit}</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full" style={{ background: gradient }} />
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>
          {anchors[0]} {tr.legend.quiet}
        </span>
        <span>{anchors[1]}</span>
        <span>
          {anchors[anchors.length - 1]}+ {tr.legend.loud}
        </span>
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-foreground/80">
        <li className="flex items-center gap-2">
          <span className="flex w-7 shrink-0 items-center justify-center gap-0.5">
            <span className="size-1.5 rounded-full border border-slate" />
            <span className="size-3.5 rounded-full border" style={{ borderColor: levelColor(anchors[1], stops) }} />
          </span>
          {tr.legend.size}
        </li>
        {showPills && (
          <li className="flex items-center gap-2">
            <span className="flex w-7 shrink-0 justify-center">
              <span className="inline-flex h-[15px] items-center rounded-full bg-foreground px-1 text-[9.5px] font-bold leading-none text-background">
                +8
              </span>
            </span>
            {tr.legend.pill}
          </li>
        )}
      </ul>
      <p className="mt-2 border-t border-dashed pt-1.5 text-[10px] leading-snug text-muted-foreground">{tr.legend.caveat}</p>
    </div>
  );
}

export default memo(MapLegend);
