"use client";

// The playhead's day, bottom-left of the map: "Σάββατο, 12 Αυγούστου 2026".
// During a wind-forward hold it takes the fast-forward mark and grows —
// the emphasis IS the skip indicator now, replacing any centered stamp.

import { useEffect, useState } from "react";
import { FastForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { ATHENS_TZ } from "@/lib/dashboard/time";
import { LOCALE } from "@/lib/strings/dashboard";
import { SKIP_HOLD_MS, type SkipEvent } from "./SkipFlash";

export default function CurrentDate({ cursorMs, skip }: { cursorMs: number; skip: SkipEvent | null }) {
  // Same derived-dismiss pattern as SkipFlash: emphasized while the hold runs.
  const [dismissedSeq, setDismissedSeq] = useState(0);
  const emphasized = skip != null && skip.seq !== dismissedSeq;

  useEffect(() => {
    if (!skip) return;
    const timer = setTimeout(() => setDismissedSeq(skip.seq), SKIP_HOLD_MS);
    return () => clearTimeout(timer);
  }, [skip]);

  const parts = new Intl.DateTimeFormat(LOCALE, {
    timeZone: ATHENS_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(cursorMs);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const rest = parts
    .filter((p) => p.type !== "weekday")
    .map((p) => p.value)
    .join("")
    .replace(/^[\s,]+/, "");

  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-lg border bg-card/95 shadow-sm backdrop-blur-sm transition-all duration-300",
        emphasized ? "px-4 py-2.5" : "px-3 py-1.5"
      )}
    >
      {emphasized && <FastForward className="size-4 shrink-0 text-sound" fill="currentColor" />}
      <span
        className={cn(
          "tabular-nums leading-tight transition-all duration-300",
          emphasized ? "text-[15px] font-bold text-foreground" : "text-[12px] font-medium text-muted-foreground"
        )}
      >
        {weekday}, {rest}
      </span>
    </div>
  );
}
