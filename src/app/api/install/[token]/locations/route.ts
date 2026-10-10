import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeStage } from "@/lib/locations";
import { occupants } from "@/lib/server/siteBinding";

// Gated like the rest of the install namespace: a valid token is the price of
// entry, unknown token gets nothing. Occupancy is deliberately anonymous —
// holding one box's token must not enumerate other devices' identities.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const sensor = await prisma.sensor.findUnique({ where: { deviceId: token } });
  if (!sensor) return NextResponse.json({ error: "unknown token" }, { status: 404 });

  const now = new Date();
  const sites = await prisma.plannedLocation.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: {
      sensors: {
        select: { deviceId: true, provisionedAt: true, installedAt: true, lastSeenAt: true, retiredAt: true, isActive: true },
      },
    },
  });

  return NextResponse.json({
    locations: sites.map(({ sensors, id, name, latitude, longitude, address }) => {
      // A site is "occupied" only by OTHER sensors that are neither retired nor
      // hidden — if this unit is re-scanning its own site, or the occupant was
      // retired/hidden, it should not be warned away from itself.
      const other = occupants(sensors, token)[0];
      return {
        id,
        name,
        latitude,
        longitude,
        address,
        occupied: other
          ? { state: computeStage(other, now) === "installed_live" ? ("live" as const) : ("silent" as const) }
          : null,
      };
    }),
  });
}
