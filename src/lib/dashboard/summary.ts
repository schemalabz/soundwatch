// The verbal summary — the most important sentence in the app: a natural
// Greek reading of exactly what the current filters show.
//
//   Ο θόρυβος στην Αθήνα
//   τον τελευταίο μήνα, μόνο Σαββατοκύριακα
//
//   Ο θόρυβος στην Πυθαγόρα 4 και στην Αλεξάνδρας 12
//   από 1η Αυγούστου μέχρι 5 Αυγούστου, μόνο τις ώρες αιχμής
//
// Pure function of the filters (unit-tested in summary.test.ts). Greek is
// inlined here on purpose: the sentence IS grammar, not a string table —
// i18n later means porting the composition rules, not just the words.

import { ATHENS_TZ, athensWallTime } from "./time";
import type { DashboardFilters, DateRange, HourPreset, LocationPin } from "./filters";

export interface SummarySentence {
  /** "Ο θόρυβος στην Αθήνα" */
  title: string;
  /** "τον τελευταίο μήνα, μόνο Σαββατοκύριακα" */
  qualifiers: string;
}

const DAY_MS = 86_400_000;

// Accusative singular ("τον Μάιο") — hardcoded: Intl yields the genitive
// (Μαΐου) for standalone months in Greek, and this is grammar, not data.
const MONTHS_ACCUSATIVE = [
  "Ιανουάριο",
  "Φεβρουάριο",
  "Μάρτιο",
  "Απρίλιο",
  "Μάιο",
  "Ιούνιο",
  "Ιούλιο",
  "Αύγουστο",
  "Σεπτέμβριο",
  "Οκτώβριο",
  "Νοέμβριο",
  "Δεκέμβριο",
];
function monthAccusative(monthIndex: number): string {
  return MONTHS_ACCUSATIVE[monthIndex];
}

const dayPartsFmt = new Intl.DateTimeFormat("el", { timeZone: ATHENS_TZ, day: "numeric", month: "long", year: "numeric" });

/** "1η Αυγούστου" / "5 Αυγούστου" (+ year when it isn't the current one). */
function datePhrase(epochMs: number, nowMs: number): string {
  const parts = dayPartsFmt.formatToParts(epochMs);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("day") === "1" ? "1η" : get("day");
  const year = athensWallTime(epochMs).year === athensWallTime(nowMs).year ? "" : ` ${get("year")}`;
  return `${day} ${get("month")}${year}`;
}

function rangePhrase(r: DateRange, nowMs: number): string {
  const lastDayMs = r.endMs - 1;
  const sameDay = athensWallTime(r.startMs).day === athensWallTime(lastDayMs).day && r.endMs - r.startMs <= 25 * 3600_000;
  if (sameDay) {
    const p = datePhrase(r.startMs, nowMs);
    return p.startsWith("1η") ? `την ${p}` : `στις ${p}`;
  }
  return `από ${datePhrase(r.startMs, nowMs)} μέχρι ${datePhrase(lastDayMs, nowMs)}`;
}

function locationPhrase(locations: readonly LocationPin[]): string {
  if (locations.length === 0) return "στην Αθήνα";
  if (locations.length > 2) return "σε διάφορες τοποθεσίες της Αθήνας";
  const name = (p: LocationPin) => p.label ?? "επιλεγμένο σημείο";
  return locations.length === 1
    ? `στην ${name(locations[0])}`
    : `στην ${name(locations[0])} και στην ${name(locations[1])}`;
}

/** The trailing-window phrase when nothing narrows the period: read the
 *  actual data span ("τους τελευταίους 3 μήνες"). */
function spanPhrase(dataStartMs: number, nowMs: number): string {
  const days = (nowMs - dataStartMs) / DAY_MS;
  if (days >= 330) return "τον τελευταίο χρόνο";
  if (days >= 55) return `τους τελευταίους ${Math.round(days / 30)} μήνες`;
  if (days >= 27) return "τον τελευταίο μήνα";
  return `τις τελευταίες ${Math.max(1, Math.round(days))} ημέρες`;
}

const HOUR_PHRASES: Record<HourPreset, string> = {
  day: "τις ώρες ημέρας",
  evening: "τα βράδια",
  night: "τις νύχτες",
  peak: "τις ώρες αιχμής",
};
const HOUR_ORDER: HourPreset[] = ["day", "evening", "night", "peak"];

function joinGreek(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} και ${items[items.length - 1]}`;
}

export function summarySentence(
  f: DashboardFilters,
  dataStartMs: number,
  nowMs: number,
  /** Viewing a single frame (map + instants): the title reads as one. */
  snapshot = false
): SummarySentence {
  const parts: string[] = [];

  // 1. The period: custom ranges > trailing preset > selected months > the
  //    full data span. (Months replace the span clause — "τον Μάιο" already
  //    answers "when", so "τους τελευταίους 3 μήνες" would just be noise.)
  const monthsSelected = f.months.size > 0 && f.months.size < 12;
  if (f.ranges.length > 2) {
    parts.push(`σε ${f.ranges.length} επιλεγμένες περιόδους`);
  } else if (f.ranges.length > 0) {
    parts.push(joinGreek(f.ranges.map((r) => rangePhrase(r, nowMs))));
  } else if (f.period === "24h") {
    parts.push("τις τελευταίες 24 ώρες");
  } else if (f.period === "7d") {
    parts.push("τις τελευταίες 7 ημέρες");
  } else if (f.period === "30d") {
    parts.push("τον τελευταίο μήνα");
  } else if (!monthsSelected) {
    parts.push(spanPhrase(dataStartMs, nowMs));
  }
  if (monthsSelected) {
    parts.push(joinGreek([...f.months].sort((a, b) => a - b).map((m) => `τον ${monthAccusative(m)}`)));
  }

  // 2. Day-of-week restriction.
  const daysClause =
    f.days.size === 1 ? ([...f.days][0] === "weekend" ? "μόνο Σαββατοκύριακα" : "μόνο καθημερινές") : null;
  if (daysClause) parts.push(daysClause);

  // 3. Hour restriction ("day+evening+night all on" covers 24h = none). The
  //    second "μόνο" drops when the days clause already said it.
  const hoursCovered = (["day", "evening", "night"] as const).every((h) => f.hours.has(h));
  if (f.hours.size > 0 && !hoursCovered) {
    const phrase = joinGreek(HOUR_ORDER.filter((h) => f.hours.has(h)).map((h) => HOUR_PHRASES[h]));
    parts.push(daysClause ? phrase : `μόνο ${phrase}`);
  }

  return {
    title: snapshot
      ? `Στιγμιότυπο από τον θόρυβο ${locationPhrase(f.locations)}`
      : `Ο θόρυβος ${locationPhrase(f.locations)}`,
    qualifiers: parts.join(", "),
  };
}
