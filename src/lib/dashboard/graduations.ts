// Graduations for the time seeker: a scale ladder that descends as far as
// the pixels afford — months over a season, days+hours over a week, hours+
// minutes inside a day. The renderer only knows three sizes:
//   major — full-height line with a section label (month, day, or hour)
//   mid   — taller centered tick (weeks, 6-hour marks, quarter hours)
//   minor — short centered tick (days, hours, minutes)
// plus small "cell labels" centered inside the interval a boundary opens.
//
// Day boundaries are true Athens midnights (DST-correct). Hour boundaries
// align with UTC hours because Athens offsets are whole hours.

import { athensWallTime, nextAthensMidnight } from "./time";

export interface Graduation {
  /** Position within the domain as 0..1. */
  fraction: number;
  size: "major" | "mid" | "minor";
  /** Label beside a major line (month name, "Σάβ 8", "14:00"). */
  sectionLabel?: string | null;
  /** Small number centered in the cell this boundary opens. */
  cellLabel?: string | null;
  /** That cell's width as a fraction of the domain. */
  cellSpan?: number;
}

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

// Legibility thresholds (px).
const MIN_TICK_PX = 7;
const MIN_WEEK_PX = 9;
const CELL_LABEL_PX = 20;
const EDGE_LABEL_CLEAR_PX = 48;

export function computeGraduations(
  rangeStartMs: number,
  nowMs: number,
  pxLength: number,
  locale: string
): Graduation[] {
  const rangeMs = nowMs - rangeStartMs;
  if (rangeMs <= 0 || pxLength <= 0) return [];
  const pxPerMs = pxLength / rangeMs;
  const pxPerHour = pxPerMs * HOUR;
  const pxPerDay = pxPerMs * DAY;

  if (pxPerHour >= 90) return minuteMode(rangeStartMs, nowMs, pxPerMs, locale);
  if (pxPerDay >= 64) return dayMode(rangeStartMs, nowMs, pxPerMs, locale);
  return monthMode(rangeStartMs, nowMs, pxPerMs, pxLength, locale);
}

/* --------------------------- month mode ---------------------------- */
/* majors: month firsts · mids: Mondays · minors: days                  */

function monthMode(startMs: number, endMs: number, pxPerMs: number, pxLength: number, locale: string): Graduation[] {
  const rangeMs = endMs - startMs;
  const pxPerDay = pxPerMs * DAY;
  const monthFmt = new Intl.DateTimeFormat(locale, { timeZone: "Europe/Athens", month: "short" });
  const showDays = pxPerDay >= MIN_TICK_PX;
  const showWeeks = showDays || pxPerDay * 7 >= MIN_WEEK_PX;
  const labelEveryDay = pxPerDay >= CELL_LABEL_PX + 4;
  const labelMondays = showDays || pxPerDay * 7 >= CELL_LABEL_PX + 6;
  const daySpan = DAY / rangeMs;

  const out: Graduation[] = [];
  const edgeLabel: Graduation = { fraction: 0, size: "major", sectionLabel: monthFmt.format(startMs) };
  let t = nextAthensMidnight(startMs);
  while (t < endMs) {
    const w = athensWallTime(t);
    const fraction = (t - startMs) / rangeMs;
    if (w.day === 1) {
      out.push({ fraction, size: "major", sectionLabel: monthFmt.format(t) });
    } else if (w.dow === 1 && showWeeks) {
      out.push({ fraction, size: "mid", cellLabel: labelMondays ? String(w.day) : null, cellSpan: daySpan });
    } else if (showDays) {
      out.push({ fraction, size: "minor", cellLabel: labelEveryDay ? String(w.day) : null, cellSpan: daySpan });
    }
    t = nextAthensMidnight(t);
  }
  // The month in effect at the domain start would otherwise never be named.
  const clearance = Math.min(0.5, EDGE_LABEL_CLEAR_PX / pxLength);
  const firstMajor = out.find((g) => g.size === "major");
  if (!firstMajor || firstMajor.fraction > clearance) out.unshift(edgeLabel);
  return out;
}

/* ---------------------------- day mode ----------------------------- */
/* majors: midnights ("Σάβ 8") · mids: 6h marks · minors: hours         */

function dayMode(startMs: number, endMs: number, pxPerMs: number, locale: string): Graduation[] {
  const rangeMs = endMs - startMs;
  const pxPerHour = pxPerMs * HOUR;
  const dayFmt = new Intl.DateTimeFormat(locale, { timeZone: "Europe/Athens", weekday: "short", day: "numeric" });
  const hourStep = pxPerHour >= MIN_TICK_PX ? 1 : pxPerHour * 3 >= MIN_TICK_PX ? 3 : 6;
  const labelEveryHour = pxPerHour >= CELL_LABEL_PX + 4;
  const labelSixHours = pxPerHour * 6 >= CELL_LABEL_PX;

  const out: Graduation[] = [];
  // Day lines at true Athens midnights.
  const midnights: number[] = [];
  let t = nextAthensMidnight(startMs);
  while (t < endMs) {
    midnights.push(t);
    out.push({ fraction: (t - startMs) / rangeMs, size: "major", sectionLabel: dayFmt.format(t) });
    t = nextAthensMidnight(t);
  }
  if (midnights.length === 0 || (midnights[0] - startMs) / rangeMs > 0.12) {
    out.unshift({ fraction: 0, size: "major", sectionLabel: dayFmt.format(startMs) });
  }
  // Hour ticks: aligned to UTC hours (Athens offsets are whole hours).
  for (let h = Math.ceil(startMs / HOUR) * HOUR; h < endMs; h += hourStep * HOUR) {
    if (midnights.includes(h)) continue; // midnight already has a major line
    const wallHour = athensWallTime(h).hour;
    if (wallHour % hourStep !== 0) continue; // keep steps aligned to wall time
    const isSix = wallHour % 6 === 0;
    const label =
      (labelEveryHour || (isSix && labelSixHours)) && wallHour % (labelEveryHour ? hourStep : 6) === 0
        ? String(wallHour).padStart(2, "0")
        : null;
    out.push({
      fraction: (h - startMs) / rangeMs,
      size: isSix ? "mid" : "minor",
      cellLabel: label,
      cellSpan: (hourStep * HOUR) / rangeMs,
    });
  }
  return out.sort((a, b) => a.fraction - b.fraction);
}

/* --------------------------- minute mode ---------------------------- */
/* majors: hours ("14:00") · mids: quarter hours · minors: minutes      */

function minuteMode(startMs: number, endMs: number, pxPerMs: number, locale: string): Graduation[] {
  const rangeMs = endMs - startMs;
  const pxPerMin = pxPerMs * MIN;
  const hourFmt = new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Athens",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const minuteStep = pxPerMin >= MIN_TICK_PX ? 1 : pxPerMin * 5 >= MIN_TICK_PX ? 5 : 15;
  const labelStep = pxPerMin * minuteStep >= CELL_LABEL_PX ? minuteStep : pxPerMin * 15 >= CELL_LABEL_PX ? 15 : 0;

  const out: Graduation[] = [];
  for (let t = Math.ceil(startMs / (minuteStep * MIN)) * minuteStep * MIN; t < endMs; t += minuteStep * MIN) {
    const sinceHour = t % HOUR;
    const minutes = Math.round(sinceHour / MIN);
    if (sinceHour === 0) {
      out.push({ fraction: (t - startMs) / rangeMs, size: "major", sectionLabel: hourFmt.format(t) });
    } else {
      out.push({
        fraction: (t - startMs) / rangeMs,
        size: minutes % 15 === 0 ? "mid" : "minor",
        cellLabel: labelStep > 0 && minutes % labelStep === 0 ? String(minutes).padStart(2, "0") : null,
        cellSpan: (minuteStep * MIN) / rangeMs,
      });
    }
  }
  if (out.length === 0 || out[0].size !== "major") {
    out.unshift({ fraction: 0, size: "major", sectionLabel: hourFmt.format(startMs) });
  }
  return out;
}
