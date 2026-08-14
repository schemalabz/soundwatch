// Number formatting for the dashboard — Greek conventions (decimal comma).

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
