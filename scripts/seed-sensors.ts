// Thin host-mode wrapper: upsert the simulated fleet's sensor metadata.
// The fleet definition lives in simulator/fleet.ts; the upsert logic in
// simulator/seed.ts (also used by the backfill).

import { PrismaClient } from "@prisma/client";
import { seedFleet } from "../simulator/seed";

const prisma = new PrismaClient();

seedFleet(prisma)
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
