import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "@/app/api/admin/auth";
import { READING_SELECT, serializeReading } from "@/lib/api/readings";
import { ReadingsQuerySchema } from "@/lib/api/schemas";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);

  const parsed = ReadingsQuerySchema.safeParse(
    Object.fromEntries(url.searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid query",
        issues: parsed.error.issues.map(
          (i) => `${i.path.join(".")}: ${i.message}`
        ),
      },
      { status: 400 }
    );
  }
  const { from, to } = parsed.data;
  const limit = parsed.data.limit ?? 1000;

  const sensor = await prisma.sensor.findUnique({ where: { id } });
  // Bench units (isExperimental) are not public. 404 rather than 403 so their
  // existence is not confirmable without admin auth.
  if (!sensor || (sensor.isExperimental && checkAdminAuth(request) !== null)) {
    return NextResponse.json({ error: "Sensor not found" }, { status: 404 });
  }

  const where: {
    sensorId: string;
    recordedAt?: { gte?: Date; lte?: Date };
  } = { sensorId: id };

  // from/to filter on the device clock — that is what a chart x-axis wants —
  // but ordering must be receivedAt: device clocks run up to ~35 min ahead and
  // jump back on NTP resync, so sorting on recordedAt silently drops
  // recently-received rows from a drifting unit.
  if (from || to) {
    where.recordedAt = {};
    if (from) where.recordedAt.gte = new Date(from);
    if (to) where.recordedAt.lte = new Date(to);
  }

  const readings = await prisma.reading.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    take: limit,
    select: READING_SELECT,
  });

  return NextResponse.json({
    sensorId: id,
    count: readings.length,
    readings: readings.map(serializeReading),
  });
}
