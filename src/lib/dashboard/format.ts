// Number formatting for the dashboard — Greek conventions (decimal comma).

import { ATHENS_TZ } from "./time";

const db1 = new Intl.NumberFormat("el-GR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const int = new Intl.NumberFormat("el-GR");

/** dB value with one decimal: 64,2 */
export function fmtDb(v: number): string {
  return db1.format(v);
}

/** Thousands-grouped integer: 264.685 */
export function fmtInt(v: number): string {
  return int.format(v);
}

/**
 * Age of a reading, the way /status and the sensor pane already say it:
 * 12δ · 3λ · ~2ω · ~2ημ
 *
 * Hours and days are whole and marked approximate. A decimal hour ("4,9ω")
 * is noise a reader cannot act on, and a round two hours rendered as "2,0ω"
 * reads as a bug; but a bare "5ω" for 4.6 h overstates the precision, so the
 * tilde carries what the rounding drops. Seconds and minutes are exact and
 * take no tilde. Callers pair this with the exact timestamp on hover.
 */
export function fmtAgo(s: number): string {
  if (s < 90) return `${s}δ`;
  if (s < 5400) return `${Math.round(s / 60)}λ`;
  if (s < 90000) return `~${Math.round(s / 3600)}ω`;
  return `~${Math.round(s / 86400)}ημ`;
}

const exactTime = new Intl.DateTimeFormat("el-GR", {
  timeZone: ATHENS_TZ,
  dateStyle: "medium",
  timeStyle: "medium",
});

/** The exact moment, Athens time, for a hover title beside a rounded age.
 *  Pinned to ATHENS_TZ because every visible clock is: a viewer abroad must
 *  not read a hover that disagrees with the column beside it. */
export function fmtExactTime(iso: string | null | undefined): string | undefined {
  return iso == null ? undefined : exactTime.format(new Date(iso));
}

/** An unsigned duration in the age formatter's units: 12δ · 1λ 45δ. Minutes appear from 60 s up. */
export function fmtDurationS(s: number): string {
  const abs = Math.abs(Math.round(s));
  if (abs < 60) return `${abs}δ`;
  return `${Math.floor(abs / 60)}λ ${abs % 60}δ`;
}
