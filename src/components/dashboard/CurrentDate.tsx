"use client";

// The playhead's day, bottom-left of the map: "Σάββατο, 12 Αυγούστου 2026".
// During a wind-forward hold it takes the fast-forward mark and grows —
// the emphasis IS the skip indicator now, replacing any centered stamp.

import { memo, useEffect, useState } from "react";
import { FastForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { ATHENS_TZ, athensWallTime } from "@/lib/dashboard/time";
import { LOCALE } from "@/lib/strings/dashboard";
import { SKIP_HOLD_MS, type SkipEvent } from "./SkipFlash";

function CurrentDate({
  cursorMs,
  windowS,
  skip,
}: {
  cursorMs: number;
  /** The trailing aggregation window of the shown frame (speed-dependent). */
  windowS: number;
  skip: SkipEvent | null;
}) {
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

  // The frame is a TRAILING window ending at the cursor — show the whole
  // span being averaged, not just its end. When the span crosses midnight
  // (6-hour frames do), the start gets its weekday.
  const startMs = cursorMs - windowS * 1000;
  const timeFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: ATHENS_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const crossesDay = athensWallTime(startMs).day !== athensWallTime(cursorMs).day;
  const dayFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: ATHENS_TZ, weekday: "short" });
  const range = `${crossesDay ? `${dayFmt.format(startMs)} ` : ""}${timeFmt.format(startMs)}–${timeFmt.format(cursorMs)}`;

  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-[6.25rem] right-4 z-10 flex items-center gap-2 rounded-lg border bg-card/95 shadow-sm backdrop-blur-sm transition-all duration-300 max-md:bottom-3 max-md:left-3 max-md:right-auto",
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
        <span className={cn("ml-1.5 font-normal", emphasized ? "text-foreground/80" : "text-muted-foreground/80")}>
          · {range}
        </span>
      </span>
    </div>
  );
}

// cursorMs arrives minute-quantized while live; skip events are rare.
export default memo(CurrentDate);
