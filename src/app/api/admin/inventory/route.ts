import { NextResponse } from "next/server";
import type { InventoryResponse, InventoryToken } from "@/lib/api/admin";
import { prisma } from "@/lib/db";
import { groupBoxes } from "@/lib/fleet/inventory";
import { lifecycleStatus } from "@/lib/fleet/status";
import { adminNow } from "@/lib/server/clock";
import { checkAdminAuth } from "../auth";

export const dynamic = "force-dynamic";

const TARGET = 50;

interface LastRow { sensor_id: string; last_at: Date | null; battery: number | null; rssi: number | null; release: string | null }

// Inventory: every physical box (chip id), the token it uses now, and the
// tokens it used before.
export async function GET(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;
  const now = adminNow();

  const sensors = await prisma.sensor.findMany({
    orderBy: { createdAt: "asc" },
    include: { plannedLocation: { select: { name: true } } },
  });

  const last = await prisma.$queryRaw<LastRow[]>`
    SELECT s.id AS sensor_id, l.received_at AS last_at, l.battery, l.rssi, l.soundwatch_release AS release
    FROM sensors s LEFT JOIN LATERAL (
      SELECT received_at, battery, rssi, soundwatch_release FROM readings r
      WHERE r.sensor_id = s.id ORDER BY received_at DESC LIMIT 1
    ) l ON true`;
  const lastBy = new Map(last.map((r) => [r.sensor_id, r]));

  const token = (s: (typeof sensors)[number]): InventoryToken => ({
    id: s.id, deviceId: s.deviceId, apName: s.apName, isExperimental: s.isExperimental,
    createdAt: s.createdAt.toISOString(), retiredAt: s.retiredAt?.toISOString() ?? null, isActive: s.isActive,
  });

  const boxes = groupBoxes(sensors).map((b) => {
    const s = b.current;
    const l = lastBy.get(s.id);
    const lastReceivedAt = l?.last_at ?? null;
    const status = lifecycleStatus(
      { retiredAt: s.retiredAt, isActive: s.isActive, isExperimental: s.isExperimental, provisionedAt: s.provisionedAt,
        handedOverAt: s.handedOverAt, installedAt: s.installedAt, lastReceivedAt },
      now,
    );
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
        rssiLast: l?.rssi ?? null,
      },
      previous: b.previous.map(token),
      duplicates: b.duplicates.map(token),
    };
  });

  const payload: InventoryResponse = { generatedAt: now.toISOString(), target: TARGET, boxes };
  return NextResponse.json(payload);
}
