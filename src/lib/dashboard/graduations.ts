// Ruler graduations for the time seeker: month boundaries as major lines,
// weeks/days as minor ticks — whichever the available pixel density affords.
// Boundaries are true Athens-local midnights (DST-correct), computed by
// walking days once per (range, now) and cached by the caller via memo.

import { athensWallTime, nextAthensMidnight } from "./time";

export type GraduationLevel = "month" | "week" | "day";

export interface Graduation {
  /** Position within [rangeStart, now] as 0..1. */
  fraction: number;
  level: GraduationLevel;
  /** Month short name for month graduations, day-of-month for days. */
  label: string | null;
}

// Minimum pixels between ticks for a level to be legible.
const MIN_PX_PER_DAY = 7;
const MIN_PX_PER_WEEK = 9;

/** Which minor graduation the space affords ("month" = majors only). */
export function graduationLevel(pxLength: number, rangeMs: number): GraduationLevel {
  const days = rangeMs / 86_400_000;
  if (days <= 0) return "month";
  if (pxLength / days >= MIN_PX_PER_DAY) return "day";
  if (pxLength / (days / 7) >= MIN_PX_PER_WEEK) return "week";
  return "month";
}

export function computeGraduations(
  rangeStartMs: number,
  nowMs: number,
  pxLength: number,
  locale: string
): Graduation[] {
  const rangeMs = nowMs - rangeStartMs;
  if (rangeMs <= 0 || pxLength <= 0) return [];
  const minor = graduationLevel(pxLength, rangeMs);
  const monthFmt = new Intl.DateTimeFormat(locale, { timeZone: "Europe/Athens", month: "short" });

  const out: Graduation[] = [];
  // Walk true Athens midnights across the range (~range/1d iterations).
  let t = nextAthensMidnight(rangeStartMs);
  while (t < nowMs) {
    const w = athensWallTime(t);
    const fraction = (t - rangeStartMs) / rangeMs;
    if (w.day === 1) {
      out.push({ fraction, level: "month", label: monthFmt.format(t) });
    } else if (minor !== "month" && w.dow === 1) {
      // Monday: week boundary.
      out.push({ fraction, level: "week", label: minor === "day" ? String(w.day) : null });
    } else if (minor === "day") {
      out.push({ fraction, level: "day", label: null });
    }
    t = nextAthensMidnight(t);
  }
  return out;
}
