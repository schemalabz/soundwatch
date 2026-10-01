// Flavor 2: level-histogram percentiles + third-octave bands.
// The device packs arrays as dash-separated strings (NETBUFF is 512B):
//   id 241 = histogram counts — two layouts, chosen by payload_version:
//     v<=4: dense, 30 x 2dB bins covering 30-90 device-dB; both end bins are
//           open-ended ([88, inf) and below 32), so a percentile there is a bound
//     v>=5: sparse, "<firstBin>-<widthUnits>-<c>-<c>-..." over a 55-bin 2dB grid
//           from 20 device-dB (firmware 1.2). Only the non-empty span is sent;
//           widthUnits is 1 (2 dB bins) or 2 (4 dB, when the span is too wide
//           to fit the payload). "0" = no frames.
//   id 242 = per-band energy as dB*10 ints (21 slots: LOW + 20 third-octaves)

// The dense v<=4 layout. Still the shape the public API serves as `hist`.
export const HIST_BINS = 30;
export const HIST_BIN_DB = 2;
export const HIST_MIN_DB = 30; // bin i covers [30+2i, 30+2(i+1)) device-dB

// The v5 grid (firmware SckUrban.h HIST_MIN_DB / HIST_BINS).
export const HIST_V5_MIN_DB = 20;
export const HIST_V5_BINS = 55; // 20-130 device-dB; bin 54 is open-ended above 128
export const HIST_SPARSE_VERSION = 5;

/** A decoded histogram: counts[i] covers [minDb + i*binDb, +binDb). */
export interface Histogram {
  minDb: number;
  binDb: number;
  counts: number[];
  /** counts[0] also holds everything below minDb */
  bottomOpen: boolean;
  /** the last bin also holds everything above its upper edge */
  topOpen: boolean;
}

// Band slot labels (documenting the firmware LUT): LOW = ~86-258 Hz (512-pt FFT
// cannot resolve third-octaves below a 250 Hz centre), then 250 Hz..20 kHz.
// `as const` on purpose: a consumer looks a band up BY LABEL
// (NOISE_FLOOR_FROM_BAND in src/lib/sensor/live.ts). Against a plain string[]
// a relabelled band would answer -1 and go unnoticed; against the literal
// tuple the lookup does not compile.
export const BAND_LABELS = [
  "low", "250", "315", "400", "500", "630", "800", "1000", "1250", "1600",
  "2000", "2500", "3150", "4000", "5000", "6300", "8000", "10000", "12500",
  "16000", "20000",
] as const;

export type BandLabel = (typeof BAND_LABELS)[number];

export interface Percentiles {
  l10: number; // level exceeded 10% of the time (90th percentile)
  l50: number; // median level
  l90: number; // level exceeded 90% of the time (10th percentile)
}

export function parseCounts(raw: string): number[] | null {
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
 * Decode id 241 in the layout its payload_version declares. A missing version
 * means pre-v5 firmware (every such unit predates the sparse layout).
 * Returns null when malformed.
 */
export function decodeHist(histRaw: string, payloadVersion: number | null): Histogram | null {
  const parts = parseCounts(histRaw);
  if (!parts) return null;
  if ((payloadVersion ?? 0) < HIST_SPARSE_VERSION) {
    if (parts.length !== HIST_BINS) return null;
    return { minDb: HIST_MIN_DB, binDb: HIST_BIN_DB, counts: parts, bottomOpen: true, topOpen: true };
  }
  if (parts.length === 1 && parts[0] === 0) {
    return { minDb: HIST_V5_MIN_DB, binDb: HIST_BIN_DB, counts: [], bottomOpen: false, topOpen: false };
  }
  const [first, width, ...counts] = parts;
  if (parts.length < 3 || (width !== 1 && width !== 2)) return null;
  const lastGridBin = first + width * counts.length - 1;
  if (lastGridBin >= HIST_V5_BINS + width - 1) return null; // runs off the grid
  return {
    minDb: HIST_V5_MIN_DB + first * HIST_BIN_DB,
    binDb: width * HIST_BIN_DB,
    counts,
    bottomOpen: first === 0,
    topOpen: lastGridBin >= HIST_V5_BINS - 1,
  };
}

/**
 * L10/L50/L90 from the packed histogram, interpolating linearly within a bin.
 * Lx = level exceeded x% of the time = the (100-x)th percentile of frame levels.
 * Returns null when the histogram is empty or malformed.
 */
export function computePercentiles(histRaw: string, payloadVersion: number | null = null): Percentiles | null {
  const h = decodeHist(histRaw, payloadVersion);
  if (!h) return null;
  const { counts, minDb, binDb } = h;
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const levelAt = (fraction: number): number => {
    const target = fraction * total;
    let cum = 0;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] === 0) continue;
      if (cum + counts[i] >= target) {
        const within = (target - cum) / counts[i];
        return minDb + i * binDb + within * binDb;
      }
      cum += counts[i];
    }
    return minDb + counts.length * binDb;
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
