import { HIST_BIN_DB, HIST_BINS, HIST_MIN_DB } from "../../../mqtt-ingester/flavor2";
import type { ApiReading } from "./schemas";

// Rendering helpers for censored levels. The README tells consumers to render
// "≥ 88" rather than a confident number when the histogram's top bin is
// occupied; this is that rule as code, so every dashboard does not reimplement
// it (and reimplement it differently).
//
// Semantics: soundwatch-firmware/docs/soundwatch/measurement-contract.md

/** Lower edge of the open-ended top bin: 88 device-dB. Derived, not hardcoded. */
export const TOP_BIN_FLOOR_DB = HIST_MIN_DB + (HIST_BINS - 1) * HIST_BIN_DB;
/** Upper edge of the open-ended bottom bin: 32 device-dB. */
export const BOTTOM_BIN_CEILING_DB = HIST_MIN_DB + HIST_BIN_DB;

export type LevelBound = "lower" | "upper" | null;

export interface DescribedLevel {
  value: number | null;
  /** "lower" = the true level is at least this. "upper" = at most this. */
  bound: LevelBound;
  /** Ready to render: "≥ 88.5", "≤ 32.0", "63.1", or "—". */
  display: string;
}

/**
 * Describe a percentile (l10/l50/l90) honestly, given its reading's censoring
 * flags. A percentile is only censored when it actually LANDS in an open-ended
 * bin — topBinCensored alone means the interval contained loud frames, which
 * bounds lmaxEst and the tail but says nothing about a percentile that sits
 * lower down.
 */
/**
 * Only the DEVICE's per-interval percentiles can be censored this way, because
 * only they come from the 30-bin histogram whose top bin is open-ended. The
 * dashboard rollup also publishes l10/l50/l90, but those are percentiles over
 * interval LAeq in 1 dB bins running to 128 — a different statistic that has no
 * 88 dB ceiling and is never censored.
 *
 * Taking the flags from ApiReading rather than a loose object is what keeps the
 * two apart: a rollup bucket carries no such fields, so passing one here does
 * not compile instead of silently rendering a wrong ">= 88".
 */
type DeviceCensoring = Pick<
  ApiReading,
  "topBinCensored" | "bottomBinCensored"
>;

export function describeLevel(
  value: number | null | undefined,
  censoring: Partial<DeviceCensoring> = {},
  decimals = 1
): DescribedLevel {
  if (value == null) return { value: null, bound: null, display: "—" };

  const bound: LevelBound =
    censoring.topBinCensored && value >= TOP_BIN_FLOOR_DB
      ? "lower"
      : censoring.bottomBinCensored && value <= BOTTOM_BIN_CEILING_DB
        ? "upper"
        : null;

  const n = value.toFixed(decimals);
  return {
    value,
    bound,
    display: bound === "lower" ? `≥ ${n}` : bound === "upper" ? `≤ ${n}` : n,
  };
}

/**
 * lmax_est is a single 11.6 ms frame and is a lower bound whenever the
 * interval put frames in the open-ended top bin.
 */
export function isLmaxLowerBound(
  reading: Partial<Pick<ApiReading, "topBinCensored">>
): boolean {
  return reading.topBinCensored === true;
}
