import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "../../../auth";
import { generateShareKey } from "@/lib/server/sensorAccess";
import { sensorShareUrl } from "@/lib/sensor/api";

// The share link for /sensors/[id]: a read-only credential for one sensor,
// handed to someone outside (an acoustics expert beside a bench unit) who
// must not hold the admin token or the device's MQTT token.
//
//   POST   mint, or rotate — the previous key stops working at once
//   DELETE revoke

async function load(id: string) {
  return prisma.sensor.findUnique({ where: { id }, select: { id: true } });
}

/**
 * The link for a key, built BEFORE the key is written — the order matters.
 *
 * `new URL` throws on a scheme-less base, and `NEXT_PUBLIC_BASE_URL=soundwatch.gr`
 * is the natural way to get that wrong. Building after the update meant a
 * Rotate click invalidated the expert's working link, returned 500, and never
 * surfaced the replacement: the link died with nothing to replace it. Rotating
 * is destructive and must not run until the response it returns is known good.
 *
 * The public address when deployment knows it (NEXT_PUBLIC_BASE_URL, set by
 * the compose files); the request's own origin otherwise. An unusable base
 * falls back there rather than throwing — inside a container that origin is
 * the bind address and not what a browser can open, so the link may need
 * fixing by hand, but a link an admin can correct beats a key rotated into
 * a 500.
 */
function shareUrl(id: string, shareKey: string, requestUrl: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL;
  if (base) {
    try {
      return sensorShareUrl(id, shareKey, base);
    } catch {
      // Not a usable base (no scheme, say). Fall through to the origin.
    }
  }
  return sensorShareUrl(id, shareKey, requestUrl);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const { id } = await params;
  if (!(await load(id))) {
    return NextResponse.json({ error: "Sensor not found" }, { status: 404 });
  }

  const shareKey = generateShareKey();
  const url = shareUrl(id, shareKey, request.url);
  await prisma.sensor.update({ where: { id }, data: { shareKey } });
  return NextResponse.json({ shareKey, url });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const { id } = await params;
  if (!(await load(id))) {
    return NextResponse.json({ error: "Sensor not found" }, { status: 404 });
  }

  await prisma.sensor.update({ where: { id }, data: { shareKey: null } });
  return NextResponse.json({ shareKey: null });
}
