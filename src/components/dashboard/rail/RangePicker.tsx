"use client";

// The Περίοδος section's custom date-span form (extracted from FilterRail —
// it owns its open/from/to state and nothing of the rail's).

import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";
import { athensDateStartMs, athensWallTime, nextAthensMidnight } from "@/lib/dashboard/time";
import type { DateRange } from "@/lib/dashboard/filters";

/** The date-span form behind a dashed affordance. Opens prefilled with the
 *  last 7 days (no dead disabled state to stare at), labeled fields, Enter
 *  submits. Whole Athens days, end inclusive. */
export default function RangePicker({
  dataStartMs,
  nowMs,
  onAdd,
}: {
  dataStartMs: number;
  nowMs: number;
  onAdd: (r: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const toIso = (ms: number) => {
    const w = athensWallTime(ms);
    return `${w.year}-${String(w.month + 1).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
  };
  const minDate = toIso(dataStartMs);
  const maxDate = toIso(nowMs);

  const parse = (s: string): [number, number, number] | null => {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? [Number(m[1]), Number(m[2]) - 1, Number(m[3])] : null;
  };
  const fromParts = parse(from);
  const toParts = parse(to);
  const valid =
    fromParts != null &&
    toParts != null &&
    athensDateStartMs(...fromParts) <= athensDateStartMs(...toParts);

  const submit = () => {
    if (!fromParts || !toParts || !valid) return;
    onAdd({
      startMs: athensDateStartMs(...fromParts),
      endMs: nextAthensMidnight(athensDateStartMs(...toParts)),
    });
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setFrom(toIso(nowMs - 6 * 86_400_000));
          setTo(toIso(nowMs));
          setOpen(true);
        }}
        className="mt-1.5 w-full rounded-md border border-dashed border-border/80 px-3 py-1.5 text-left text-[11.5px] text-muted-foreground transition-colors hover:border-sound/60 hover:text-foreground"
      >
        <CalendarPlus className="mr-1.5 inline size-3.5 align-[-2px]" />
        {tr.period.addRange}
      </button>
    );
  }
  return (
    <form
      className="mt-1.5 rounded-md border p-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            [tr.period.rangeFrom, from, setFrom, minDate, to || maxDate],
            [tr.period.rangeTo, to, setTo, from || minDate, maxDate],
          ] as const
        ).map(([label, value, set, min, max]) => (
          <label key={label} className="block">
            <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {label}
            </span>
            <input
              type="date"
              value={value}
              min={min}
              max={max}
              onChange={(e) => set(e.target.value)}
              className="w-full rounded-md border bg-background px-1.5 py-1 text-[11px] tabular-nums outline-none transition-colors focus:border-sound"
            />
          </label>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="submit"
          disabled={!valid}
          className="flex-1 rounded-md border border-sound/40 py-1 text-[11px] font-medium text-sound transition-colors hover:bg-sound/10 disabled:opacity-35"
        >
          {tr.period.rangeApply}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {tr.period.rangeCancel}
        </button>
      </div>
    </form>
  );
}

