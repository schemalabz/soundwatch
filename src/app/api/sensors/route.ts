import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const sensors = await prisma.sensor.findMany({
    where: { isActive: true },
    include: {
      readings: {
        orderBy: { recordedAt: "desc" },
        take: 1,
        select: {
          recordedAt: true,
          noiseDba: true,
          laeq: true,
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
    // Soundwatch firmware ships the stock single-snapshot Noise dBA (id 53)
    // DISABLED and emits continuous accumulators instead, which the ingester
    // turns into laeq. Surface laeq under the existing noiseDba key so every
    // noise-facing view keeps working; laeq is the better number anyway (an
    // energy average over ~650 frames, not one 11.6ms snapshot).
    latestReading: sensor.readings[0]
      ? {
          ...sensor.readings[0],
          noiseDba: sensor.readings[0].noiseDba ?? sensor.readings[0].laeq,
        }
      : null,
  }));

  return NextResponse.json(result);
}
