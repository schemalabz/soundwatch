import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PUBLIC_SENSOR_WHERE } from "@/lib/locations";
import { checkAdminAuth } from "../admin/auth";
import { READING_COLUMNS, serializeReading, type ReadingRow } from "@/lib/api/readings";
import { PUBLIC_SENSOR_SQL } from "@/lib/server/filterSql";

export const dynamic = "force-dynamic";

// Latest reading per sensor via LEFT JOIN LATERAL ... LIMIT 1: one probe of the
// (sensor_id, received_at DESC) index per sensor. Prisma's
// `include: { readings: { take: 1 } }` compiles to a window function over the
// whole readings table — seconds of scan at millions of rows, and it only gets
// worse as history grows. The response shape is still main's
// (SensorListItemSchema), because the columns are aliased back to camelCase and
// handed to the shared serializer.


const LATEST_READING_SQL = Object.entries(READING_COLUMNS)
  .map(([field, col]) => `r.${col} AS "${field}"`)
  .join(", ");

type LatestRow = ReadingRow & { sensorId: string };

export async function GET(request: Request) {
  // Bench units are not public. An authorized admin can ask for them
  // explicitly; everyone else never learns they exist.
  const wantsExperimental =
    new URL(request.url).searchParams.get("includeExperimental") === "1" &&
    checkAdminAuth(request) === null;

  const where = wantsExperimental
    ? { isActive: PUBLIC_SENSOR_WHERE.isActive, latitude: PUBLIC_SENSOR_WHERE.latitude }
    : PUBLIC_SENSOR_WHERE;
  const sqlWhere = wantsExperimental
    ? "s.is_active AND s.latitude IS NOT NULL"
    : PUBLIC_SENSOR_SQL;

  const [sensors, latest] = await Promise.all([
    prisma.sensor.findMany({
      where,
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        address: true,
        isActive: true,
        isExperimental: true,
        lastSeenAt: true,
      },
      orderBy: { name: "asc" },
    }),
    // received_at, not recorded_at: device clocks drift ~10 min forward between
    // NTP syncs, so the device clock must never decide which reading is latest.
    prisma.$queryRawUnsafe<LatestRow[]>(`
      SELECT s.id AS "sensorId", ${LATEST_READING_SQL}
      FROM sensors s
      JOIN LATERAL (
        SELECT * FROM readings r
        WHERE r.sensor_id = s.id
        ORDER BY r.received_at DESC
        LIMIT 1
      ) r ON true
      WHERE ${sqlWhere}`),
  ]);

  const latestBySensor = new Map(latest.map((r) => [r.sensorId, r]));

  return NextResponse.json(
    sensors.map((sensor) => {
      const row = latestBySensor.get(sensor.id);
      return {
        id: sensor.id,
        name: sensor.name,
        latitude: sensor.latitude,
        longitude: sensor.longitude,
        address: sensor.address,
        isActive: sensor.isActive,
        isExperimental: sensor.isExperimental,
        lastSeenAt: sensor.lastSeenAt ? sensor.lastSeenAt.toISOString() : null,
        latestReading: row ? serializeReading(row) : null,
      };
    })
  );
}
