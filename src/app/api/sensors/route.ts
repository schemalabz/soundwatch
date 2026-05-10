import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const sensors = await prisma.sensor.findMany({
    where: { isActive: true },
    include: {
      readings: {
        orderBy: { recordedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  const result = sensors.map((sensor) => {
    const latest = sensor.readings[0] ?? null;
    return {
      id: sensor.id,
      deviceId: sensor.deviceId,
      name: sensor.name,
      latitude: sensor.latitude,
      longitude: sensor.longitude,
      address: sensor.address,
      isActive: sensor.isActive,
      lastSeenAt: sensor.lastSeenAt,
      latestReading: latest
        ? {
            recordedAt: latest.recordedAt,
            noiseDba: latest.noiseDba,
            temperature: latest.temperature,
            humidity: latest.humidity,
            lightLux: latest.lightLux,
            pressurePa: latest.pressurePa,
            uvIndex: latest.uvIndex,
            pm1: latest.pm1,
            pm25: latest.pm25,
            pm4: latest.pm4,
            pm10: latest.pm10,
          }
        : null,
    };
  });

  return NextResponse.json(result);
}
