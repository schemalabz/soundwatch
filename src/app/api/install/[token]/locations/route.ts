import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeStage } from "@/lib/locations";

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
        select: { deviceId: true, provisionedAt: true, installedAt: true, lastSeenAt: true },
      },
    },
  });

  return NextResponse.json({
    locations: sites.map(({ sensors, id, name, latitude, longitude, address }) => {
      // A site is "occupied" only by OTHER sensors — if this unit is re-scanning
      // its own site, it should not be warned away from itself.
      const other = sensors.find((s) => s.deviceId !== token);
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
