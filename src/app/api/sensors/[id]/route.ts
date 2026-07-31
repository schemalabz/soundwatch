import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const sensor = await prisma.sensor.findUnique({
    // push the readings `take: 1` into a LATERAL JOIN with LIMIT 1 (uses the
    // descending index) instead of loading every reading and slicing in memory.
    relationLoadStrategy: "join",
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

  const raw = sensor.readings[0] ?? null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const latestReading = raw ? (({ sensorId: _sid, ...rest }) => rest)(raw) : null;
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
    latestReading,
  });
}
