// Inventory: physical boxes, not tokens. A box is its chip id (hardware_id);
// re-provisioning mints a new token for the same chip, so one box can own
// several sensor rows over its life. Pure functions — the inventory route
// feeds them rows and returns what they decide.

/** Proposed bench check: a box reports this long, with signal and a level,
 *  before it ships. Most of the Oct 1 batch sent 1–2 readings and was boxed. */
export const BENCH_CHECK_MIN_S = 30 * 60;
export const BENCH_CHECK_MIN_READINGS = 50;

export interface TokenRow {
  id: string;
  deviceId: string;
  hardwareId: string | null;
  createdAt: Date;
  retiredAt: Date | null;
  isActive: boolean;
  isExperimental: boolean;
}

export interface Box<T extends TokenRow> {
  /** The chip id, or `token:<deviceId>` for a row that never reported one. */
  key: string;
  hardwareId: string | null;
  /** The token in use: newest not retired (else newest). */
  current: T;
  /** Older tokens for the same chip, newest first. */
  previous: T[];
  /** Older tokens still active — the phantom rows to retire. */
  duplicates: T[];
}

/** Group token rows into boxes by chip id. */
export function groupBoxes<T extends TokenRow>(rows: T[]): Box<T>[] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const key = r.hardwareId ?? `token:${r.deviceId}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  const boxes: Box<T>[] = [];
  for (const [key, g] of groups) {
    const byNewest = [...g].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const current = byNewest.find((r) => !r.retiredAt && r.isActive) ?? byNewest[0];
    const previous = byNewest.filter((r) => r !== current);
    boxes.push({
      key,
      hardwareId: g[0].hardwareId,
      current,
      previous,
      duplicates: previous.filter((r) => !r.retiredAt && r.isActive),
    });
  }
  return boxes;
}

export interface BenchStats {
  readings: number;
  /** Seconds between the first and last bench reading. */
  spanS: number;
  /** Readings that carried a wifi signal. */
  withRssi: number;
  /** Readings that carried a sound level. */
  withLevel: number;
}

export type BenchVerdict = "passed" | "short" | "none";

export function benchCheck(s: BenchStats): { verdict: BenchVerdict; text: string } {
  if (s.readings === 0) return { verdict: "none", text: "Never reported" };
  const mins = Math.floor(s.spanS / 60);
  const ok =
    s.spanS >= BENCH_CHECK_MIN_S &&
    s.readings >= BENCH_CHECK_MIN_READINGS &&
    s.withRssi >= s.readings * 0.9 &&
    s.withLevel >= s.readings * 0.9;
  if (ok) return { verdict: "passed", text: `Passed · ${mins} min, ${s.readings} readings` };
  const what = s.readings === 1 ? "1 reading" : `${s.readings} readings`;
  return { verdict: "short", text: `Too short · ${what}${mins >= 1 ? ` over ${mins} min` : ""}` };
}
