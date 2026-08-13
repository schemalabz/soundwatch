import { HIST_BINS, parseCounts } from "../../../mqtt-ingester/flavor2";

// Bin 29 of the level histogram is open-ended [88, ∞) device-dB and bin 0 is
// open-ended below 32, so a percentile landing there is a bound, not a value.
// These flags are what let a client render "≥ 88" instead of a confident wrong
// number. Semantics: soundwatch-firmware/docs/soundwatch/measurement-contract.md
export interface HistCensoring {
  topBinCensored: boolean;
  bottomBinCensored: boolean;
}

export function parseHist(histRaw: string | null): number[] | null {
  if (histRaw == null) return null;
  const counts = parseCounts(histRaw);
  return counts && counts.length === HIST_BINS ? counts : null;
}

export function deriveCensoring(histRaw: string | null): HistCensoring | null {
  const counts = parseHist(histRaw);
  if (!counts) return null;
  return {
    topBinCensored: counts[HIST_BINS - 1] > 0,
    bottomBinCensored: counts[0] > 0,
  };
}
