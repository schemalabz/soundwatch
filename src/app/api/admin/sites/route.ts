import { NextResponse } from "next/server";
import type { AdminSite, SitesResponse, UnlinkedUnit } from "@/lib/api/admin";
import { prisma } from "@/lib/db";
import { adminNow } from "@/lib/server/clock";
import { loadFleet } from "@/lib/server/fleet";
import { checkAdminAuth } from "../auth";

export const dynamic = "force-dynamic";

const STAGE_RANK = { live: 0, watch: 1, silent: 2 } as const;

// The Sites page's view: every planned site with the units bound to it (and
// their live status from the fleet), plus installed units that have no site
// yet — the ones to link.
export async function GET(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;
  const now = adminNow();

  const [sites, fleet] = await Promise.all([
    prisma.plannedLocation.findMany({ orderBy: { name: "asc" } }),
    loadFleet(prisma, now),
  ]);

  const out: AdminSite[] = sites.map((s) => {
    const units = fleet.units
      .filter((u) => u.site?.id === s.id && u.status !== "retired")
      .map((u) => ({
        id: u.id, deviceId: u.deviceId, apName: u.apName, status: u.status, lastReceivedAt: u.lastReceivedAt,
        provider: u.network.provider, routerRestarts7d: u.network.routerRestarts7d,
      }));
    const deployed = units.filter((u) => u.status === "live" || u.status === "watch" || u.status === "silent");
    const best = deployed.sort((a, b) => STAGE_RANK[a.status as keyof typeof STAGE_RANK] - STAGE_RANK[b.status as keyof typeof STAGE_RANK])[0];
    return {
      id: s.id, key: s.key, name: s.name, address: s.address, notes: s.notes,
      latitude: s.latitude, longitude: s.longitude, isActive: s.isActive,
      units,
      stage: best ? (best.status as AdminSite["stage"]) : "waiting",
    };
  });

  const unlinked: UnlinkedUnit[] = fleet.units
    .filter((u) => !u.site && u.installedAt && u.latitude != null && u.longitude != null
      && (u.status === "live" || u.status === "watch" || u.status === "silent"))
    .map((u) => ({
      id: u.id, deviceId: u.deviceId, apName: u.apName, name: u.name, address: u.address,
      latitude: u.latitude!, longitude: u.longitude!, status: u.status, installedAt: u.installedAt,
    }));

  const payload: SitesResponse = { generatedAt: now.toISOString(), target: 50, sites: out, unlinked };
  return NextResponse.json(payload);
}
