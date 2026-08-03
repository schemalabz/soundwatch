import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decideLocationWrite } from "@/lib/locations";

/**
 * The installer tells us where the unit ended up.
 *
 * Unauthenticated, like the status endpoint: the token is printed on the box in
 * the installer's hands, and installers are contractors without accounts. The
 * exposure is bounded — it can set a location on a device someone physically
 * holds, and nothing else.
 *
 * Two independent conflicts, two independent confirmations:
 *  - `force` — this sensor already has a location (realistic mistake: scanning
 *    the wrong label and silently relocating a deployed unit);
 *  - `acceptOccupied` — the chosen planned site already has another unit
 *    (legitimate case: replacing a dead one).
 *
 * Binding to a planned site copies the site's name/address onto the sensor row
 * (copy-on-bind): later edits to the site never rewrite deployed sensors.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const { latitude, longitude, address, name, force, plannedLocationId, acceptOccupied } = body;

  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
      lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: "valid latitude and longitude required" }, { status: 400 });
  }

  const sensor = await prisma.sensor.findUnique({ where: { deviceId: token } });
  if (!sensor) {
    return NextResponse.json({ error: "unknown token" }, { status: 404 });
  }

  // Optional site binding: validate the site, learn its occupancy.
  let site: { id: string; name: string; address: string | null } | null = null;
  let siteOccupiedByOther = false;
  if (plannedLocationId != null) {
    const found = await prisma.plannedLocation.findUnique({
      where: { id: String(plannedLocationId) },
      include: { sensors: { select: { deviceId: true } } },
    });
    if (!found || !found.isActive) {
      return NextResponse.json({ error: "unknown or retired planned location" }, { status: 400 });
    }
    site = { id: found.id, name: found.name, address: found.address };
    siteOccupiedByOther = found.sensors.some((s) => s.deviceId !== token);
  }

  const decision = decideLocationWrite({
    sensorHasLocation: sensor.latitude != null && sensor.longitude != null,
    force: force === true,
    siteOccupiedByOther,
    acceptOccupied: acceptOccupied === true,
  });
  if (!decision.ok) {
    return NextResponse.json(
      decision.error === "already_located"
        ? {
            error: "already located",
            detail: "This device already has a location. Re-send with force:true only if you are sure this is the right box.",
            current: { latitude: sensor.latitude, longitude: sensor.longitude, address: sensor.address },
          }
        : {
            error: "site occupied",
            detail: "This planned location already has a unit. Re-send with acceptOccupied:true to install here anyway (e.g. replacing a dead unit).",
          },
      { status: decision.status }
    );
  }

  const updated = await prisma.sensor.update({
    where: { deviceId: token },
    data: {
      latitude: lat,
      longitude: lon,
      ...(site
        ? { plannedLocationId: site.id, name: site.name, ...(site.address ? { address: site.address } : {}) }
        : { ...(address ? { address } : {}), ...(name ? { name } : {}) }),
      installedAt: new Date(),
    },
  });

  return NextResponse.json({
    token: updated.deviceId,
    latitude: updated.latitude,
    longitude: updated.longitude,
    address: updated.address,
    name: updated.name,
    plannedLocationId: updated.plannedLocationId,
  });
}
