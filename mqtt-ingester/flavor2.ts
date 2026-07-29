// Flavor 2: level-histogram percentiles + third-octave bands.
// The device packs arrays as dash-separated strings (NETBUFF is 512B):
//   id 241 = histogram counts, 30 x 2dB bins covering 30-90 device-dB
//   id 242 = per-band energy as dB*10 ints (21 slots: LOW + 20 third-octaves)

export const HIST_BINS = 30;
export const HIST_BIN_DB = 2;
export const HIST_MIN_DB = 30; // bin i covers [30+2i, 30+2(i+1)) device-dB

// Band slot labels (documenting the firmware LUT): LOW = ~86-258 Hz (512-pt FFT
// cannot resolve third-octaves below a 250 Hz centre), then 250 Hz..20 kHz.
export const BAND_LABELS = [
  "low", "250", "315", "400", "500", "630", "800", "1000", "1250", "1600",
  "2000", "2500", "3150", "4000", "5000", "6300", "8000", "10000", "12500",
  "16000", "20000",
];

export interface Percentiles {
  l10: number; // level exceeded 10% of the time (90th percentile)
  l50: number; // median level
  l90: number; // level exceeded 90% of the time (10th percentile)
}

function parseCounts(raw: string): number[] | null {
  if (!raw) return null;
  const parts = raw.split("-");
  const counts: number[] = [];
  for (const p of parts) {
    if (p.length === 0 || !/^\d+$/.test(p)) return null;
    counts.push(Number(p));
  }
  return counts;
}

/**
 * L10/L50/L90 from the packed histogram, interpolating linearly within a bin.
 * Lx = level exceeded x% of the time = the (100-x)th percentile of frame levels.
 * Returns null when the histogram is empty or malformed.
 */
export function computePercentiles(histRaw: string): Percentiles | null {
  const counts = parseCounts(histRaw);
  if (!counts) return null;
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const levelAt = (fraction: number): number => {
    const target = fraction * total;
    let cum = 0;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] === 0) continue;
      if (cum + counts[i] >= target) {
        const within = (target - cum) / counts[i];
        return HIST_MIN_DB + i * HIST_BIN_DB + within * HIST_BIN_DB;
      }
      cum += counts[i];
    }
    return HIST_MIN_DB + counts.length * HIST_BIN_DB;
  };

  return {
    l10: levelAt(0.9),
    l50: levelAt(0.5),
    l90: levelAt(0.1),
  };
}

/** Decode the packed band string (dB*10 ints) to dB floats; 0 = silent -> null. */
export function decodeBandsDb(bandsRaw: string): (number | null)[] | null {
  if (!bandsRaw) return null;
  const parts = bandsRaw.split("-");
  const out: (number | null)[] = [];
  for (const p of parts) {
    if (p.length === 0 || !/^\d+$/.test(p)) return null;
    const v = Number(p);
    out.push(v === 0 ? null : v / 10);
  }
  return out;
}
