/**
 * Seed the database.
 *
 *   npm run seed                # minimal (default)
 *   npm run seed -- minimal     # 15 named sensors + 24h of per-minute data
 *   npm run seed -- full        # 50 sensors + a realistic 3-month tiered dataset
 *
 * "minimal" is fast and enough for the UI to work. "full" generates ~6.6M rows
 * (24h raw + 30d of minute rollups + 90d of hour rollups) to test performance
 * at volume.
 */
import { PrismaClient } from "@prisma/client";
import { seedSensors, backfillRange, refreshRollups, trimRawTo24h } from "./seed-lib";

const prisma = new PrismaClient();
const mode = (process.argv[2] || "minimal").toLowerCase();
const MINIMAL_SENSORS = 15;
const FULL_SENSORS = 50;

async function main() {
  if (mode !== "minimal" && mode !== "full") {
    throw new Error(`Unknown mode "${mode}". Use: minimal | full`);
  }
  const started = Date.now();
  console.log(`Seeding (${mode})...`);

  if (mode === "minimal") {
    console.log(`  sensors: ${await seedSensors(prisma, MINIMAL_SENSORS)}`);
    const rows = await backfillRange(prisma, 24, 60, 0); // 24h @ 1/min
    console.log(`  readings: ${rows.toLocaleString()} (24h @ 1min)`);
    await refreshRollups(prisma, 2, 2);
    console.log("  rollups refreshed");
  } else {
    console.log(`  sensors: ${await seedSensors(prisma, FULL_SENSORS)}`);
    let rows = 0;
    rows += await backfillRange(prisma, 24, 1, 0); // last 24h @ 1/sec
    rows += await backfillRange(prisma, 720, 60, 24); // days 1-30 @ 1/min
    rows += await backfillRange(prisma, 2160, 3600, 720); // days 30-90 @ 1/hour
    console.log(`  readings: ${rows.toLocaleString()} raw inserted`);
    await refreshRollups(prisma, 31, 91);
    console.log("  rollups refreshed (30d minute, 90d hour)");
    await trimRawTo24h(prisma);
    console.log("  raw trimmed to 24h (retention)");
  }

  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
