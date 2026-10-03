import { NextResponse } from "next/server";
import type { InventoryResponse, InventoryToken } from "@/lib/api/admin";
import { prisma } from "@/lib/db";
import { benchCheck, groupBoxes } from "@/lib/fleet/inventory";
import { lifecycleStatus } from "@/lib/fleet/status";
import { adminNow } from "@/lib/server/clock";
import { checkAdminAuth } from "../auth";

export const dynamic = "force-dynamic";

const TARGET = 50;

interface StatRow {
  sensor_id: string;
  n: bigint;
  first_at: Date | null;
  last_at: Date | null;
  with_rssi: bigint;
  with_level: bigint;
  rssi_avg: number | null;
}
interface LastRow { sensor_id: string; last_at: Date | null; battery: number | null; release: string | null }

// Inventory: every physical box (chip id), the token it uses now, the tokens
// it used before, and — for boxes not yet installed — how its bench check went.
export async function GET(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;
  const now = adminNow();

  const sensors = await prisma.sensor.findMany({
    orderBy: { createdAt: "asc" },
    include: { plannedLocation: { select: { name: true } } },
  });

  const [stats, last] = await Promise.all([
    // Bench readings: everything a not-yet-installed production unit sent.
    // Bench units are excluded — months of data, and no bench check applies.
    // The LONGEST continuous run (gaps under 10 min), not first-to-last: a
    // spare powered for a few minutes in August and again in September is
    // not 57 days of bench check.
    prisma.$queryRaw<StatRow[]>`
      WITH r AS (
        SELECT r.sensor_id, r.received_at, r.rssi, coalesce(r.laeq, r.noise_dba) AS level,
               CASE WHEN r.received_at - lag(r.received_at) OVER w > INTERVAL '10 minutes' THEN 1 ELSE 0 END AS brk
        FROM readings r JOIN sensors s ON s.id = r.sensor_id
        WHERE s.installed_at IS NULL AND NOT s.is_experimental AND s.retired_at IS NULL AND s.is_active
        WINDOW w AS (PARTITION BY r.sensor_id ORDER BY r.received_at)
      ),
      runs AS (
        SELECT sensor_id, sum(brk) OVER (PARTITION BY sensor_id ORDER BY received_at) AS run, received_at, rssi, level FROM r
      ),
      agg AS (
        SELECT sensor_id, run, count(*)::bigint AS n, min(received_at) AS first_at, max(received_at) AS last_at,
               count(rssi)::bigint AS with_rssi, count(level)::bigint AS with_level, avg(rssi) AS rssi_avg
        FROM runs GROUP BY 1, 2
      )
      SELECT DISTINCT ON (sensor_id) sensor_id, n, first_at, last_at, with_rssi, with_level, rssi_avg
      FROM agg ORDER BY sensor_id, (last_at - first_at) DESC, n DESC`,
    prisma.$queryRaw<LastRow[]>`
      SELECT s.id AS sensor_id, l.received_at AS last_at, l.battery, l.soundwatch_release AS release
      FROM sensors s LEFT JOIN LATERAL (
        SELECT received_at, battery, soundwatch_release FROM readings r
        WHERE r.sensor_id = s.id ORDER BY received_at DESC LIMIT 1
      ) l ON true`,
  ]);
  const statBy = new Map(stats.map((r) => [r.sensor_id, r]));
  const lastBy = new Map(last.map((r) => [r.sensor_id, r]));

  const token = (s: (typeof sensors)[number]): InventoryToken => ({
    id: s.id, deviceId: s.deviceId, apName: s.apName, isExperimental: s.isExperimental,
    createdAt: s.createdAt.toISOString(), retiredAt: s.retiredAt?.toISOString() ?? null, isActive: s.isActive,
  });

  const boxes = groupBoxes(sensors).map((b) => {
    const s = b.current;
    const st = statBy.get(s.id);
    const l = lastBy.get(s.id);
    const lastReceivedAt = l?.last_at ?? null;
    const status = lifecycleStatus(
      { retiredAt: s.retiredAt, isActive: s.isActive, isExperimental: s.isExperimental, provisionedAt: s.provisionedAt,
        handedOverAt: s.handedOverAt, installedAt: s.installedAt, lastReceivedAt },
      now,
    );
    const bench = status === "in_box" || status === "with_installer" || status === "minted"
      ? benchCheck({
          readings: Number(st?.n ?? 0),
          spanS: st?.first_at && st.last_at ? (st.last_at.getTime() - st.first_at.getTime()) / 1000 : 0,
          withRssi: Number(st?.with_rssi ?? 0),
          withLevel: Number(st?.with_level ?? 0),
        })
      : null;
    return {
      key: b.key,
      hardwareId: b.hardwareId,
      current: {
        ...token(s),
        status,
        provisionedAt: s.provisionedAt?.toISOString() ?? null,
        handedOverAt: s.handedOverAt?.toISOString() ?? null,
        installedAt: s.installedAt?.toISOString() ?? null,
        lastReceivedAt: lastReceivedAt?.toISOString() ?? null,
        siteName: s.plannedLocation?.name ?? s.name ?? null,
        firmware: l?.release ?? null,
        batteryLast: l?.battery ?? null,
        rssiAvg: st?.rssi_avg != null ? Math.round(st.rssi_avg) : null,
        bench,
      },
      previous: b.previous.map(token),
      duplicates: b.duplicates.map(token),
    };
  });

  const payload: InventoryResponse = { generatedAt: now.toISOString(), target: TARGET, boxes };
  return NextResponse.json(payload);
}
