// One-off (and safely re-runnable) backfill of device_events.
//
//   npx tsx scripts/backfill-device-events.ts                 restarts from readings history
//   npx tsx scripts/backfill-device-events.ts <broker.log>    + connection events from a broker log
//
// From then on the ingester records both live (recordBootIfAny per reading,
// tailBrokerLog for the log). Idempotent: (sensor, kind, at) is unique.
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { importBrokerEvents, parseBrokerLine, type BrokerEvent } from "../mqtt-ingester/events";

// Restarts are uptime going DOWN between consecutive on-time readings, in
// arrival order. On-time only: a backlog upload interleaves old uptimes with
// live ones and reads as hundreds of phantom restarts (Περιστέρι, Sep 4–6).
// Arrival order, not device time: a fast clock jumps BACK at its restart, and
// ordering on recorded_at then interleaves two boots. The 30-minute on-time
// cut and the 05:00–07:00 Athens scheduled window mirror src/lib/fleet/status.ts.
const BOOTS_SQL = `
  INSERT INTO device_events (sensor_id, kind, at, detail, source)
  SELECT sensor_id, 'boot', boot_at,
         jsonb_build_object('uptimeBefore', prev_up, 'resetCause', reset_cause,
           'scheduled', extract(hour FROM boot_at AT TIME ZONE 'Europe/Athens') BETWEEN 5 AND 6),
         'backfill'
  FROM (
    SELECT sensor_id, reset_cause, device_uptime_s AS up,
           lag(device_uptime_s) OVER (PARTITION BY sensor_id ORDER BY received_at, recorded_at) AS prev_up,
           received_at - make_interval(secs => device_uptime_s) AS boot_at
    FROM readings
    WHERE device_uptime_s IS NOT NULL
      AND abs(extract(epoch FROM received_at - recorded_at)) <= 1800
  ) r
  WHERE up < prev_up
  ON CONFLICT (sensor_id, kind, at) DO NOTHING`;

async function main() {
  const prisma = new PrismaClient();
  try {
    const boots = await prisma.$executeRawUnsafe(BOOTS_SQL);
    console.log(`restarts from readings: ${boots} new`);

    const logPath = process.argv[2];
    if (logPath) {
      const lines = (await readFile(logPath, "utf8")).split("\n");
      const events = lines.map(parseBrokerLine).filter((e): e is BrokerEvent => e != null);
      const n = await importBrokerEvents(prisma, events);
      console.log(`connection events from ${logPath}: ${events.length} parsed, ${n} new for known units`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
