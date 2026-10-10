// Run the incident evaluator once and exit — to see what it would open,
// close and send without waiting on the ingester's minute tick.
//
//   npx tsx scripts/alerts-once.ts                     now
//   AT=2026-10-03T03:20:00Z npx tsx scripts/alerts-once.ts   as of a moment (a restored snapshot)
//
// Writes incidents like the ingester does; without DISCORD_WEBHOOK_URL the
// messages are logged (dry run) instead of sent.
import { PrismaClient } from "@prisma/client";
import { runAlertsOnce } from "../mqtt-ingester/alerts";

const prisma = new PrismaClient();
runAlertsOnce(prisma, process.env.AT ? new Date(process.env.AT) : new Date())
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
