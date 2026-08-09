// Simulator CLI:
//   tsx simulator/index.ts seed      — upsert the 50-sensor fleet metadata
//   tsx simulator/index.ts backfill  — seed + bulk-insert history (idempotent)
//   tsx simulator/index.ts live      — stream readings over MQTT forever
//   tsx simulator/index.ts all       — backfill, then live
//
// Env: DATABASE_URL, SIM_MQTT_URL (or MQTT_BROKER_URL), SIM_INTERVAL_S (live
// cadence, default 5), SIM_BACKFILL_DAYS (default 90), SIM_BACKFILL_INTERVAL_S
// (default 60), SIM_SEED (any string; changes the whole fleet's randomness).

import { PrismaClient } from "@prisma/client";
import { backfill } from "./backfill";
import { runLive } from "./live";
import { seedFleet } from "./seed";

async function main(): Promise<void> {
  const command = process.argv[2] || "all";

  if (!["seed", "backfill", "live", "all"].includes(command)) {
    console.error(`Unknown command "${command}". Usage: tsx simulator/index.ts <seed|backfill|live|all>`);
    process.exit(1);
  }

  if (command === "live") {
    runLive();
    return; // runs forever
  }

  const prisma = new PrismaClient();
  try {
    if (command === "seed") {
      await seedFleet(prisma);
    } else {
      await backfill(prisma); // backfill seeds first
    }
  } finally {
    await prisma.$disconnect();
  }

  if (command === "all") {
    runLive();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
