import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * The installer tells us where the unit ended up.
 *
 * Unauthenticated, like the status endpoint: the token is printed on the box in
 * the installer's hands, and installers are contractors without accounts. The
 * exposure is bounded — it can set a location on a device someone physically
 * holds, and nothing else.
 *
 * Refuses to overwrite an existing location, because the realistic mistake is
 * scanning the wrong label and silently relocating a unit that is already
 * deployed somewhere else. Moving a unit deliberately is an admin action.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const { latitude, longitude, address, name, force } = body;

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

  if (sensor.latitude != null && sensor.longitude != null && force !== true) {
    return NextResponse.json(
      {
        error: "already located",
        detail: "This device already has a location. Re-send with force:true only if you are sure this is the right box.",
        current: { latitude: sensor.latitude, longitude: sensor.longitude, address: sensor.address },
      },
      { status: 409 }
    );
  }

  const updated = await prisma.sensor.update({
    where: { deviceId: token },
    data: {
      latitude: lat,
      longitude: lon,
      ...(address ? { address } : {}),
      ...(name ? { name } : {}),
      installedAt: new Date(),
    },
  });

  return NextResponse.json({
    token: updated.deviceId,
    latitude: updated.latitude,
    longitude: updated.longitude,
    address: updated.address,
    name: updated.name,
  });
}
