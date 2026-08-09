// The 1-dB level-bin scheme shared by the readings_hour_bins continuous
// aggregate and every consumer of it. Percentiles are interpolated from bin
// counts (measured ≤0.1 dB off percentile_cont at our distributions) — this
// is what lets every rollup query be a plain hash aggregation instead of a
// full sort of the window.
//
// The cagg definition in scripts/timescale-objects.ts hardcodes these
// numbers in SQL; levelBins.test.ts pins the two together.

export const BIN_LO = 30;
export const BIN_HI = 91;
export const BIN_COUNT = BIN_HI - BIN_LO; // 1-dB bins

/** Low dB edge of a width_bucket bin (0 = underflow, BIN_COUNT+1 = overflow). */
export function binLow(bin: number): number {
  if (bin <= 0) return BIN_LO - 1;
  if (bin > BIN_COUNT) return BIN_HI;
  return BIN_LO + (bin - 1);
}

export interface BinRow {
  bin: number;
  energy: number;
  lmax: number;
  n: bigint | number;
}

export interface LevelSummary {
  laeq: number;
  l50: number;
  l10: number;
  l90: number;
  lmax: number;
  n: number;
}

export class BinAccumulator {
  bins = new Map<number, number>();
  energy = 0;
  lmax = -Infinity;
  n = 0;

  add(row: BinRow): void {
    const count = Number(row.n);
    this.bins.set(row.bin, (this.bins.get(row.bin) ?? 0) + count);
    this.energy += row.energy;
    this.lmax = Math.max(this.lmax, row.lmax);
    this.n += count;
  }

  /** Linear interpolation inside the 1-dB bin containing the p-quantile. */
  percentile(p: number): number {
    const sorted = [...this.bins.entries()].sort((a, b) => a[0] - b[0]);
    const rank = p * this.n;
    let cum = 0;
    for (const [bin, count] of sorted) {
      if (cum + count >= rank) {
        const frac = count > 0 ? (rank - cum) / count : 0;
        return binLow(bin) + frac;
      }
      cum += count;
    }
    return binLow(sorted[sorted.length - 1]?.[0] ?? 0) + 1;
  }

  out(): LevelSummary {
    return {
      laeq: 10 * Math.log10(this.energy / this.n),
      l50: this.percentile(0.5),
      l10: this.percentile(0.9),
      l90: this.percentile(0.1),
      lmax: this.lmax,
      n: this.n,
    };
  }
}
