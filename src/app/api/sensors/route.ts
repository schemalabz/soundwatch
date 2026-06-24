import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const sensors = await prisma.sensor.findMany({
    // "join" pushes the readings `take: 1` into a LATERAL JOIN with LIMIT 1
    // (uses idx_readings_sensor_time). Without it Prisma fetches every reading
    // for each sensor and slices in memory — unusably slow at scale.
    relationLoadStrategy: "join",
    where: { isActive: true },
    include: {
      readings: {
        orderBy: { recordedAt: "desc" },
        take: 1,
        select: {
          recordedAt: true,
          noiseDba: true,
          temperature: true,
          humidity: true,
          lightLux: true,
          pressurePa: true,
          uvA: true,
          uvB: true,
          uvC: true,
          pm1: true,
          pm25: true,
          pm4: true,
          pm10: true,
          pn05: true,
          pn10: true,
          pn25: true,
          pn40: true,
          pn100: true,
          tps: true,
          battery: true,
          rssi: true,
          sdCard: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const result = sensors.map((sensor) => ({
    id: sensor.id,
    deviceId: sensor.deviceId,
    name: sensor.name,
    latitude: sensor.latitude,
    longitude: sensor.longitude,
    address: sensor.address,
    isActive: sensor.isActive,
    lastSeenAt: sensor.lastSeenAt,
    latestReading: sensor.readings[0] ?? null,
  }));

  return NextResponse.json(result);
}
