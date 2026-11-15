// One-off: fill readings.corrected_at / corrected_hour_shift for rows ingested
// before the ingester estimated device clock error (issue #12, migration 0023).
//
// Runs the SAME estimator as the live ingester (src/lib/fleet/clockOffset.ts),
// row by row per sensor in arrival order, so historical rows are corrected
// exactly as they would have been live. Idempotent: re-running recomputes and
// rewrites the same values.
//
//   npx tsx scripts/backfill-corrected-at.ts            # dry run: report only
//   npx tsx scripts/backfill-corrected-at.ts --write    # update rows, then refresh the rollup
//
// The dry run prints, per sensor and in total, how many rows move to another
// hour — the number issue #12 measured as 20.4% of v4 rows.
//
// Rows from before migration 0004 have received_at = the migration time, not
// their arrival, so their d is meaningless. They arrive as one giant burst,
// never feed the estimate, and stay uncorrected (device clock), as before.

import { PrismaClient } from "@prisma/client";

import { correctClock, emptyClockState } from "../src/lib/fleet/clockOffset";

const PAGE = 20_000;
const WRITE_BATCH = 2_000;

interface Row {
  recorded_at: Date;
  received_at: Date;
}

async function main() {
  const write = process.argv.includes("--write");
  const prisma = new PrismaClient();
  try {
    const sensors = await prisma.$queryRaw<{ id: string; device_id: string }[]>`
      SELECT id, device_id FROM sensors ORDER BY device_id`;
    let total = 0;
    let corrected = 0;
    let shifted = 0;

    for (const s of sensors) {
      const state = emptyClockState();
      let n = 0;
      let nCorrected = 0;
      let nShifted = 0;
      let pending: { recordedAt: Date; correctedAt: Date | null; shift: number }[] = [];
      let cursor: { received: Date; recorded: Date } | null = null;

      const flush = async () => {
        if (!write || pending.length === 0) return;
        const values = pending
          .map(
            (p) =>
              `('${p.recordedAt.toISOString()}'::timestamptz, ${p.correctedAt ? `'${p.correctedAt.toISOString()}'::timestamptz` : "NULL::timestamptz"}, ${p.shift}::smallint)`
          )
          .join(",");
        await prisma.$executeRawUnsafe(`
          UPDATE readings r
          SET corrected_at = v.c, corrected_hour_shift = v.h
          FROM (VALUES ${values}) v(rec, c, h)
          WHERE r.sensor_id = '${s.id}' AND r.recorded_at = v.rec
            AND (r.corrected_at IS DISTINCT FROM v.c OR r.corrected_hour_shift <> v.h)`);
        pending = [];
      };

      for (;;) {
        const page: Row[] = cursor
          ? await prisma.$queryRaw<Row[]>`
              SELECT recorded_at, received_at FROM readings
              WHERE sensor_id = ${s.id} AND (received_at, recorded_at) > (${cursor.received}, ${cursor.recorded})
              ORDER BY received_at, recorded_at LIMIT ${PAGE}`
          : await prisma.$queryRaw<Row[]>`
              SELECT recorded_at, received_at FROM readings
              WHERE sensor_id = ${s.id}
              ORDER BY received_at, recorded_at LIMIT ${PAGE}`;
        if (page.length === 0) break;
        for (const r of page) {
          const c = correctClock(state, { recordedAt: r.recorded_at, receivedAt: r.received_at });
          n++;
          if (c.correctedAt) nCorrected++;
          if (c.hourShift !== 0) nShifted++;
          pending.push({ recordedAt: r.recorded_at, correctedAt: c.correctedAt, shift: c.hourShift });
          if (pending.length >= WRITE_BATCH) await flush();
        }
        const last = page[page.length - 1];
        cursor = { received: last.received_at, recorded: last.recorded_at };
      }
      await flush();

      total += n;
      corrected += nCorrected;
      shifted += nShifted;
      if (n > 0) {
        console.log(
          `${s.device_id.padEnd(24)} rows ${String(n).padStart(9)}  corrected ${pct(nCorrected, n)}  other hour ${pct(nShifted, n)}`
        );
      }
    }

    console.log(`\nTOTAL rows ${total}  corrected ${pct(corrected, total)}  other hour ${shifted} (${pct(shifted, total)})`);

    if (write) {
      // The UPDATEs logged invalidations over every touched hour; one refresh
      // over all history re-materializes exactly those, nothing else.
      console.log("refreshing readings_hour_bins ...");
      await prisma.$executeRawUnsafe(`CALL refresh_continuous_aggregate('readings_hour_bins', NULL, now() - INTERVAL '1 hour')`);
      console.log("done");
    } else {
      console.log("dry run: nothing written (pass --write)");
    }
  } finally {
    await prisma.$disconnect();
  }
}

function pct(a: number, b: number): string {
  return `${b === 0 ? "0.0" : ((100 * a) / b).toFixed(1)}%`.padStart(6);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
