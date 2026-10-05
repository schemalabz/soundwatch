import { NextResponse } from "next/server";
import type { AdminIncident, IncidentsResponse } from "@/lib/api/admin";
import { prisma } from "@/lib/db";
import {
  ALERT_ROUTER_RESTARTS_24H, ALERT_SILENT_MS, ALERT_UNSCHEDULED_BOOTS_24H, ALERT_WEAK_RSSI_DBM,
} from "@/lib/fleet/alerts";
import type { SilentCause } from "@/lib/fleet/status";
import { adminNow } from "@/lib/server/clock";
import { loadFleet } from "@/lib/server/fleet";
import { checkAdminAuth } from "../auth";

export const dynamic = "force-dynamic";

// Incidents as the evaluator in the ingester recorded them, with each unit's
// current title and status. Read-only: incidents open and close themselves.
export async function GET(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;
  const now = adminNow();

  const [openRows, resolvedRows, fleet] = await Promise.all([
    prisma.incident.findMany({ where: { closedAt: null }, orderBy: { openedAt: "desc" } }),
    prisma.incident.findMany({
      where: { closedAt: { gt: new Date(now.getTime() - 14 * 86400_000) } },
      orderBy: { openedAt: "desc" },
      take: 300,
    }),
    loadFleet(prisma, now),
  ]);
  const rows = [...openRows, ...resolvedRows];
  const units = new Map(fleet.units.map((u) => [u.id, u]));

  const shape = (r: (typeof rows)[number]): AdminIncident => {
    const u = units.get(r.sensorId);
    const ev = (r.evidence ?? null) as Record<string, unknown> | null;
    return {
      id: String(r.id),
      kind: r.kind as AdminIncident["kind"],
      cause: (r.cause as SilentCause | null) ?? null,
      openedAt: r.openedAt.toISOString(),
      closedAt: r.closedAt?.toISOString() ?? null,
      notifiedAt: r.notifiedAt?.toISOString() ?? null,
      delivery: typeof ev?.delivery === "string" ? ev.delivery : null,
      evidence: ev,
      unit: {
        id: r.sensorId,
        title: u?.site?.name ?? u?.name ?? u?.address ?? (u?.apName ? `Box ${u.apName.replace(/^Soundwatch-/, "")}` : r.sensorId.slice(0, 8)),
        apName: u?.apName ?? null,
        status: u?.status ?? "retired",
        latestNote: u?.latestNote ?? null,
      },
    };
  };

  const payload: IncidentsResponse = {
    generatedAt: now.toISOString(),
    open: rows.filter((r) => !r.closedAt).map(shape),
    resolved: rows.filter((r) => r.closedAt).sort((a, b) => b.closedAt!.getTime() - a.closedAt!.getTime()).map(shape),
    rules: {
      silentMinutes: ALERT_SILENT_MS / 60_000,
      routerRestarts24h: ALERT_ROUTER_RESTARTS_24H,
      unscheduledBoots24h: ALERT_UNSCHEDULED_BOOTS_24H,
      weakRssiDbm: ALERT_WEAK_RSSI_DBM,
    },
  };
  return NextResponse.json(payload);
}
