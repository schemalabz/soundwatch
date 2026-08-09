import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PUBLIC_SENSOR_WHERE } from "@/lib/locations";

export const dynamic = "force-dynamic";

// Latest reading per sensor via LEFT JOIN LATERAL ... LIMIT 1: one probe of
// the (sensor_id, recorded_at DESC) index per sensor. The previous Prisma
// `include: { readings: { take: 1 } }` compiled to a window function over
// the whole readings table — seconds of scan at millions of rows, and it
// only gets worse as history grows.

interface LatestSqlRow {
  sensor_id: string;
  recorded_at: Date;
  noise_dba: number | null;
  laeq: number | null;
  temperature: number | null;
  humidity: number | null;
  light_lux: number | null;
  pressure_pa: number | null;
  uv_a: number | null;
  uv_b: number | null;
  uv_c: number | null;
  pm1: number | null;
  pm25: number | null;
  pm4: number | null;
  pm10: number | null;
  pn_05: number | null;
  pn_10: number | null;
  pn_25: number | null;
  pn_40: number | null;
  pn_100: number | null;
  tps: number | null;
  battery: number | null;
  rssi: number | null;
  sd_card: number | null;
}

export async function GET() {
  const [sensors, latest] = await Promise.all([
    prisma.sensor.findMany({
      where: PUBLIC_SENSOR_WHERE,
      select: {
        id: true,
        deviceId: true,
        name: true,
        latitude: true,
        longitude: true,
        address: true,
        isActive: true,
        lastSeenAt: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.$queryRaw<LatestSqlRow[]>`
      SELECT s.id AS sensor_id, r.recorded_at, r.noise_dba, r.laeq,
             r.temperature, r.humidity, r.light_lux, r.pressure_pa,
             r.uv_a, r.uv_b, r.uv_c, r.pm1, r.pm25, r.pm4, r.pm10,
             r.pn_05, r.pn_10, r.pn_25, r.pn_40, r.pn_100,
             r.tps, r.battery, r.rssi, r.sd_card
      FROM sensors s
      JOIN LATERAL (
        SELECT * FROM readings r
        WHERE r.sensor_id = s.id
        ORDER BY r.recorded_at DESC
        LIMIT 1
      ) r ON true
      WHERE s.is_active AND NOT s.is_experimental AND s.latitude IS NOT NULL`,
  ]);

  const latestBySensor = new Map(latest.map((r) => [r.sensor_id, r]));

  const result = sensors.map((sensor) => {
    const r = latestBySensor.get(sensor.id);
    return {
      ...sensor,
      // Soundwatch firmware ships the stock single-snapshot Noise dBA (id 53)
      // DISABLED and emits continuous accumulators instead, which the
      // ingester turns into laeq. Surface laeq under the existing noiseDba
      // key so every noise-facing view keeps working; laeq is the better
      // number anyway (an energy average over ~650 frames, not one 11.6ms
      // snapshot).
      latestReading: r
        ? {
            recordedAt: r.recorded_at,
            noiseDba: r.noise_dba ?? r.laeq,
            laeq: r.laeq,
            temperature: r.temperature,
            humidity: r.humidity,
            lightLux: r.light_lux,
            pressurePa: r.pressure_pa,
            uvA: r.uv_a,
            uvB: r.uv_b,
            uvC: r.uv_c,
            pm1: r.pm1,
            pm25: r.pm25,
            pm4: r.pm4,
            pm10: r.pm10,
            pn05: r.pn_05,
            pn10: r.pn_10,
            pn25: r.pn_25,
            pn40: r.pn_40,
            pn100: r.pn_100,
            tps: r.tps,
            battery: r.battery,
            rssi: r.rssi,
            sdCard: r.sd_card,
          }
        : null,
    };
  });

  return NextResponse.json(result);
}
