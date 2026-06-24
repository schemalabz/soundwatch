import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type Resolution = "raw" | "1m" | "1h";

// Rollup caggs store aggregated columns under different names; alias them back
// to the raw reading shape so the frontend is agnostic to the source. Noise is
// the energy-averaged LAeq for the bucket.
interface RollupReading {
  recordedAt: Date;
  noiseDba: number | null;
  noiseMin: number | null;
  noiseMax: number | null;
  temperature: number | null;
  humidity: number | null;
  lightLux: number | null;
  pressurePa: number | null;
  pm1: number | null;
  pm25: number | null;
  pm4: number | null;
  pm10: number | null;
  uvA: number | null;
  uvB: number | null;
  uvC: number | null;
  battery: number | null;
}

// Choose the resolution that keeps a chart-friendly point count and respects
// raw's 24h retention: raw for short zoom, then the 1m and 1h rollups.
function pickResolution(durationMs: number): Resolution {
  if (durationMs <= 2 * HOUR) return "raw";
  if (durationMs <= 2 * DAY) return "1m";
  return "1h";
}

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

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : new Date();

  // Without a `from` we serve the latest raw readings (live view).
  const resolution: Resolution = fromDate
    ? pickResolution(toDate.getTime() - fromDate.getTime())
    : "raw";

  let readings: RollupReading[] | Record<string, unknown>[];

  if (resolution === "raw") {
    const where: { sensorId: string; recordedAt?: { gte?: Date; lte?: Date } } = {
      sensorId: id,
    };
    if (fromDate || to) {
      where.recordedAt = {};
      if (fromDate) where.recordedAt.gte = fromDate;
      if (to) where.recordedAt.lte = toDate;
    }
    readings = await prisma.reading.findMany({
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
    });
  } else {
    // resolution is "1m" or "1h" — a fixed allow-list, so the table name is safe
    // to interpolate; all user values go through bound parameters ($1..$4).
    const view = resolution === "1m" ? "readings_1m" : "readings_1h";
    readings = await prisma.$queryRawUnsafe<RollupReading[]>(
      `SELECT bucket        AS "recordedAt",
              noise_laeq    AS "noiseDba",
              noise_min     AS "noiseMin",
              noise_max     AS "noiseMax",
              temperature,
              humidity,
              light_lux     AS "lightLux",
              pressure_pa   AS "pressurePa",
              pm1, pm25, pm4, pm10,
              uv_a AS "uvA", uv_b AS "uvB", uv_c AS "uvC",
              battery
         FROM ${view}
        WHERE sensor_id = $1 AND bucket >= $2 AND bucket <= $3
        ORDER BY bucket DESC
        LIMIT $4`,
      id,
      fromDate,
      toDate,
      limit
    );
  }

  return NextResponse.json({
    sensorId: id,
    deviceId: sensor.deviceId,
    resolution,
    count: readings.length,
    readings,
  });
}
