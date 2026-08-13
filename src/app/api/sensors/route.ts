import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PUBLIC_SENSOR_WHERE } from "@/lib/locations";
import { checkAdminAuth } from "../admin/auth";
import { READING_SELECT, serializeReading } from "@/lib/api/readings";

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
        // receivedAt, not recordedAt: a drifting device clock must not decide
        // which reading is "latest".
        orderBy: { receivedAt: "desc" },
        take: 1,
        select: READING_SELECT,
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
    latestReading: sensor.readings[0]
      ? serializeReading(sensor.readings[0])
      : null,
  }));

  return NextResponse.json(result);
}
