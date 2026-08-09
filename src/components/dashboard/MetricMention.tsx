"use client";

// A metric reference outside the rail ("Μέση — Ενεργειακός μέσος (LAeq)").
// Every mention is the same full wording, dotted like the rail's picker —
// and hovering one lights the picker up, teaching where the metric is
// changed without a word of UI copy.

import { cn } from "@/lib/utils";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";
import type { AggKey } from "./Timebar";

export default function MetricMention({
  metric,
  onHover,
  className,
}: {
  metric: AggKey;
  /** Mirrors hover state into the rail picker's highlight. */
  onHover?: (on: boolean) => void;
  className?: string;
}) {
  return (
    <span
      className={cn("cursor-help border-b border-dotted border-muted-foreground/50", className)}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      {tr.aggregationFull(metric)}
    </span>
  );
}
