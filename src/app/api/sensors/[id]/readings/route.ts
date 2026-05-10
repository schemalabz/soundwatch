import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 10000) : 1000;

  const sensor = await prisma.sensor.findUnique({ where: { id } });
  if (!sensor) {
    return NextResponse.json({ error: "Sensor not found" }, { status: 404 });
  }

  const where: {
    sensorId: string;
    recordedAt?: { gte?: Date; lte?: Date };
  } = { sensorId: id };

  if (from || to) {
    where.recordedAt = {};
    if (from) where.recordedAt.gte = new Date(from);
    if (to) where.recordedAt.lte = new Date(to);
  }

  const readings = await prisma.reading.findMany({
    where,
    orderBy: { recordedAt: "desc" },
    take: limit,
    select: {
      recordedAt: true,
      noiseDba: true,
      temperature: true,
      humidity: true,
      lightLux: true,
      pressurePa: true,
      uvIndex: true,
      pm1: true,
      pm25: true,
      pm4: true,
      pm10: true,
    },
  });

  return NextResponse.json({
    sensorId: id,
    deviceId: sensor.deviceId,
    count: readings.length,
    readings,
  });
}
