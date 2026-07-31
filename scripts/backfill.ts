/**
 * Standalone load-test helper: bulk-insert synthetic readings via a single
 * `generate_series` INSERT (orders of magnitude faster than the real-time
 * simulator). Use it to test query performance at volume.
 *
 *   npm run backfill -- <hoursBack> [stepSeconds] [untilHoursBack]
 *
 * Generates one row per sensor from `now()-hoursBack` to `now()-untilHoursBack`,
 * spaced every `stepSeconds` (default 1s, until 0).
 *
 *   npm run backfill                  # last 24h at 1/sec
 *   npm run backfill -- 720 60 24     # days 1-30 at 1/min
 *
 * For a full realistic dataset, prefer `npm run seed -- full`.
 */
import { PrismaClient } from "@prisma/client";
import { backfillRange } from "./seed-lib";

const prisma = new PrismaClient();
const HOURS = parseInt(process.argv[2] || "24", 10);
const STEP = parseInt(process.argv[3] || "1", 10);
const UNTIL = parseInt(process.argv[4] || "0", 10);

async function main() {
  const sensors = await prisma.sensor.count();
  console.log(
    `Backfilling now-${HOURS}h .. now-${UNTIL}h at ${STEP}s steps for ${sensors} sensor(s)...`
  );

  const started = Date.now();
  const inserted = await backfillRange(prisma, HOURS, STEP, UNTIL);
  const secs = (Date.now() - started) / 1000;
  console.log(
    `Inserted ${inserted.toLocaleString()} rows in ${secs.toFixed(1)}s ` +
      `(~${Math.round(inserted / secs).toLocaleString()} rows/sec)`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
