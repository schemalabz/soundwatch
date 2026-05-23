import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const sensor = await prisma.sensor.findUnique({
    where: { id },
    include: {
      readings: {
        orderBy: { recordedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!sensor) {
    return NextResponse.json({ error: "Sensor not found" }, { status: 404 });
  }

  const latest = sensor.readings[0] ?? null;
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
    latestReading: latest,
  });
}
