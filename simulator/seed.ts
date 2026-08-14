// Upsert the 50-sensor fleet's metadata (name/coords/address) so sensors
// render on maps and admin views. Shared by the backfill (which needs sensor
// rows before inserting readings) and scripts/seed-sensors.ts (host-mode).

import type { PrismaClient } from "@prisma/client";
import { FLEET } from "./fleet";

export async function seedFleet(prisma: PrismaClient): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const sensor of FLEET) {
    const row = await prisma.sensor.upsert({
      where: { deviceId: sensor.deviceId },
      update: {
        name: sensor.name,
        latitude: sensor.latitude,
        longitude: sensor.longitude,
        address: sensor.address,
      },
      create: {
        deviceId: sensor.deviceId,
        name: sensor.name,
        latitude: sensor.latitude,
        longitude: sensor.longitude,
        address: sensor.address,
      },
    });
    ids.set(sensor.deviceId, row.id);
  }
  console.log(`Seeded ${FLEET.length} sensors`);
  return ids;
}
