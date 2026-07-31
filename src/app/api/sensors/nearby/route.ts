import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface NearbySensor {
  id: string;
  deviceId: string;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceM: number;
}

// GET /api/sensors/nearby?lng=23.7348&lat=37.9755&radius=3000
// Returns active sensors within `radius` metres (default 5km) of the point,
// nearest first, using the PostGIS GiST index on sensors.location.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const lng = parseFloat(url.searchParams.get("lng") ?? "");
  const lat = parseFloat(url.searchParams.get("lat") ?? "");
  const radiusParam = url.searchParams.get("radius");
  const radiusM = radiusParam
    ? Math.min(Math.max(parseFloat(radiusParam), 0), 100_000)
    : 5000;

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return NextResponse.json(
      { error: "Query params `lng` and `lat` are required numbers" },
      { status: 400 }
    );
  }

  const sensors = await prisma.$queryRaw<NearbySensor[]>`
    SELECT id,
           device_id AS "deviceId",
           name,
           latitude,
           longitude,
           round(
             ST_Distance(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)::numeric
           )::float8 AS "distanceM"
    FROM sensors
    WHERE is_active
      AND location IS NOT NULL
      AND ST_DWithin(
            location,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          )
    ORDER BY location <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
  `;

  return NextResponse.json({
    center: { lng, lat },
    radiusM,
    count: sensors.length,
    sensors,
  });
}
