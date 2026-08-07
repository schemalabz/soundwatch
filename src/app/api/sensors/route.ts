import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PUBLIC_SENSOR_WHERE } from "@/lib/locations";
import { checkAdminAuth } from "../admin/auth";

export async function GET(request: Request) {
  // Admins may ask to see bench/experimental units too (the map offers this
  // when an admin token is present). The gate is server-side auth — the query
  // param alone changes nothing for anyone else.
  const wantsExperimental =
    new URL(request.url).searchParams.get("includeExperimental") === "1" &&
    checkAdminAuth(request) === null;

  const adminWhere = { isActive: PUBLIC_SENSOR_WHERE.isActive, latitude: PUBLIC_SENSOR_WHERE.latitude };
  const sensors = await prisma.sensor.findMany({
    where: wantsExperimental ? adminWhere : PUBLIC_SENSOR_WHERE,
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
    isExperimental: sensor.isExperimental,
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
