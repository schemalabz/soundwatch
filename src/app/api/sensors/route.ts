import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PUBLIC_SENSOR_WHERE } from "@/lib/locations";
import { checkAdminAuth } from "../admin/auth";
import { READING_SELECT, serializeReading, type ReadingRow } from "@/lib/api/readings";

export const dynamic = "force-dynamic";

// Latest reading per sensor via LEFT JOIN LATERAL ... LIMIT 1: one probe of the
// (sensor_id, received_at DESC) index per sensor. Prisma's
// `include: { readings: { take: 1 } }` compiles to a window function over the
// whole readings table — seconds of scan at millions of rows, and it only gets
// worse as history grows. The response shape is still main's
// (SensorListItemSchema), because the columns are aliased back to camelCase and
// handed to the shared serializer.

// camelCase field -> snake_case column. `Record<keyof ReadingRow, string>` is a
// compile-time exhaustiveness check: if READING_SELECT gains a field, this stops
// compiling rather than silently dropping it from the API.
const READING_COLUMNS: Record<keyof ReadingRow, string> = {
  recordedAt: "recorded_at",
  receivedAt: "received_at",
  noiseDba: "noise_dba",
  laeq: "laeq",
  l10: "l10",
  l50: "l50",
  l90: "l90",
  lmaxEst: "lmax_est",
  lminEst: "lmin_est",
  histRaw: "hist_raw",
  bandsDb: "bands_db",
  realizedDuty: "realized_duty",
  frameCount: "frame_count",
  intervalMs: "interval_ms",
  intervalS: "interval_s",
  payloadVersion: "payload_version",
  energySaturations: "energy_saturations",
  temperature: "temperature",
  humidity: "humidity",
  lightLux: "light_lux",
  pressurePa: "pressure_pa",
  uvA: "uv_a",
  uvB: "uv_b",
  uvC: "uv_c",
  pm1: "pm1",
  pm25: "pm25",
  pm4: "pm4",
  pm10: "pm10",
  pn05: "pn_05",
  pn10: "pn_10",
  pn25: "pn_25",
  pn40: "pn_40",
  pn100: "pn_100",
  tps: "tps",
  battery: "battery",
  rssi: "rssi",
  sdCard: "sd_card",
};

void READING_SELECT; // the shape above is pinned to it by the Record type

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
    : "s.is_active AND NOT s.is_experimental AND s.latitude IS NOT NULL";

  const [sensors, latest] = await Promise.all([
    prisma.sensor.findMany({
      where,
      select: {
        id: true,
        deviceId: true,
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
        deviceId: sensor.deviceId,
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
