// recompute-percentiles.ts — re-derive l10/l50/l90 from the stored hist_raw.
//
// The ingester computes percentiles once, at insert, and the histogram layout
// depends on payload_version (v<=4 dense 30-90 dB, v5 sparse 20-130). A v5 row
// that reached an ingester predating the v5 decoder — a deploy that lagged a
// firmware 1.2 unit, or a rollback — was read as the dense layout and stored
// wrong percentiles. hist_raw is kept verbatim, so the fix is a recompute.
//
//   DATABASE_URL=... npx tsx scripts/recompute-percentiles.ts            # dry run
//   DATABASE_URL=... npx tsx scripts/recompute-percentiles.ts --apply
//   ... --since 2026-10-01 --min-version 5     (defaults)
//
// Dry run prints how many rows would change and the largest change; nothing is
// written without --apply.
import { PrismaClient } from "@prisma/client";
import { computePercentiles } from "../mqtt-ingester/flavor2";

const args = process.argv.slice(2);
const flag = (name: string, dflt: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const apply = args.includes("--apply");
const since = new Date(flag("--since", "2026-10-01"));
const minVersion = Number(flag("--min-version", "5"));

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.reading.findMany({
    where: { recordedAt: { gte: since }, payloadVersion: { gte: minVersion }, histRaw: { not: null } },
    select: { sensorId: true, recordedAt: true, payloadVersion: true, histRaw: true, l10: true, l50: true, l90: true },
  });
  let changed = 0;
  let worst = 0;
  for (const r of rows) {
    const p = computePercentiles(r.histRaw!, r.payloadVersion);
    const d = (a: number | null | undefined, b: number | null | undefined) =>
      a == null || b == null ? (a == b ? 0 : Infinity) : Math.abs(a - b);
    const delta = Math.max(d(p?.l10, r.l10), d(p?.l50, r.l50), d(p?.l90, r.l90));
    if (delta < 1e-9) continue;
    changed++;
    if (delta !== Infinity) worst = Math.max(worst, delta);
    if (apply) {
      await prisma.reading.update({
        where: { sensorId_recordedAt: { sensorId: r.sensorId, recordedAt: r.recordedAt } },
        data: { l10: p?.l10 ?? null, l50: p?.l50 ?? null, l90: p?.l90 ?? null },
      });
    }
  }
  console.log(
    `${rows.length} rows with payload_version >= ${minVersion} since ${since.toISOString()}; ` +
      `${changed} ${apply ? "updated" : "would change"} (largest change ${worst.toFixed(2)} dB)`
  );
}

main().finally(() => prisma.$disconnect());
