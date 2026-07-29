// Flavor 1 (Step 4): continuous-LAeq. The device emits raw integer accumulators
// (ids 235-240); the server does all the log/stats here.

// Real-time frame rate for a 512-pt FFT at 44.1 kHz: the denominator for duty.
export const FRAMES_PER_SEC_REALTIME = 44100 / 512; // ≈ 86.13

// Placeholder calibration offset (dB). Real calibration vs a reference meter is
// Flavor 3; a constant offset is fine for the TREND we validate now.
export const CALIB_OFFSET_DB = 0;

export interface Flavor1Accumulators {
  energySum?: number | null;
  frameCount?: number | null;
  intervalS?: number | null;
  maxEnergy?: number | null;
  minEnergy?: number | null;
}

export interface Flavor1Computed {
  laeq: number | null; // 10*log10(mean per-frame energy) + offset
  realizedDuty: number | null; // frames captured / real-time frames in the interval
  lmaxEst: number | null; // 10*log10(max per-frame energy) + offset
  lminEst: number | null;
}

/**
 * Turn the raw device accumulators into LAeq / realized_duty / Lmax-Lmin est.
 * Returns null when the payload carries no Flavor 1 accumulator data (i.e. a
 * stock-only reading). Individual outputs are null when their inputs are
 * missing or non-positive (e.g. no frames captured yet).
 */
export function computeFlavor1(a: Flavor1Accumulators): Flavor1Computed | null {
  if (a.energySum == null || a.frameCount == null) return null;

  const laeq =
    a.frameCount > 0 && a.energySum > 0
      ? 10 * Math.log10(a.energySum / a.frameCount) + CALIB_OFFSET_DB
      : null;

  const realizedDuty =
    a.frameCount != null && a.intervalS != null && a.intervalS > 0
      ? a.frameCount / (FRAMES_PER_SEC_REALTIME * a.intervalS)
      : null;

  const lmaxEst =
    a.maxEnergy != null && a.maxEnergy > 0
      ? 10 * Math.log10(a.maxEnergy) + CALIB_OFFSET_DB
      : null;

  const lminEst =
    a.minEnergy != null && a.minEnergy > 0
      ? 10 * Math.log10(a.minEnergy) + CALIB_OFFSET_DB
      : null;

  return { laeq, realizedDuty, lmaxEst, lminEst };
}
