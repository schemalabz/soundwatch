import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface BboxSensor {
  id: string;
  deviceId: string;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  latestNoiseDba: number | null;
  latestAt: Date | null;
}

// GET /api/sensors/bbox?minLng=23.70&minLat=37.96&maxLng=23.76&maxLat=38.00
// Returns active sensors whose location falls inside the map bounding box,
// each with its latest noise reading. Spatial filter uses the GiST index on
// sensors.location; the latest reading uses idx_readings_sensor_time.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const minLng = parseFloat(url.searchParams.get("minLng") ?? "");
  const minLat = parseFloat(url.searchParams.get("minLat") ?? "");
  const maxLng = parseFloat(url.searchParams.get("maxLng") ?? "");
  const maxLat = parseFloat(url.searchParams.get("maxLat") ?? "");

  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) {
    return NextResponse.json(
      { error: "Query params minLng, minLat, maxLng, maxLat are required numbers" },
      { status: 400 }
    );
  }

  const sensors = await prisma.$queryRaw<BboxSensor[]>`
    SELECT s.id,
           s.device_id AS "deviceId",
           s.name,
           s.latitude,
           s.longitude,
           r.noise_dba   AS "latestNoiseDba",
           r.recorded_at AS "latestAt"
    FROM sensors s
    LEFT JOIN LATERAL (
      SELECT noise_dba, recorded_at
      FROM readings
      WHERE sensor_id = s.id
      ORDER BY recorded_at DESC
      LIMIT 1
    ) r ON true
    WHERE s.is_active
      AND s.location && ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326)::geography
    ORDER BY s.name ASC
  `;

  return NextResponse.json({
    bbox: { minLng, minLat, maxLng, maxLat },
    count: sensors.length,
    sensors,
  });
}
