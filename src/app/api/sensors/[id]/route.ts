import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "@/app/api/admin/auth";
import { READING_SELECT, serializeReading } from "@/lib/api/readings";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const sensor = await prisma.sensor.findUnique({
    where: { id },
    include: {
      readings: {
        // receivedAt, not recordedAt: a drifting device clock must not decide
        // which reading is "latest".
        orderBy: { receivedAt: "desc" },
        take: 1,
        select: READING_SELECT,
      },
    },
  });

  // Bench units (isExperimental) are not public. 404 rather than 403 so their
  // existence is not confirmable without admin auth.
  if (!sensor || (sensor.isExperimental && checkAdminAuth(request) !== null)) {
    return NextResponse.json({ error: "Sensor not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: sensor.id,
    deviceId: sensor.deviceId,
    name: sensor.name,
    latitude: sensor.latitude,
    longitude: sensor.longitude,
    address: sensor.address,
    firmwareVersion: sensor.firmwareVersion,
    readingIntervalS: sensor.readingIntervalS,
    isActive: sensor.isActive,
    lastSeenAt: sensor.lastSeenAt,
    createdAt: sensor.createdAt,
    latestReading: sensor.readings[0]
      ? serializeReading(sensor.readings[0])
      : null,
  });
}
