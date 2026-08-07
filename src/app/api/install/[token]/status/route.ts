import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const LIVE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Is this device alive and publishing?
 *
 * Two consumers, deliberately the same endpoint:
 *  - the provisioning script's verification gate, so a batch loop never says
 *    READY on a unit that has not actually landed a row;
 *  - the installer's QR page, so nobody walks away from a dead unit.
 *
 * Unauthenticated on purpose: knowing the token is the price of entry, and the
 * token is already printed on the box the installer is holding. It exposes only
 * liveness and the latest level — no history, no credentials, no control.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const sensor = await prisma.sensor.findUnique({
    where: { deviceId: token },
    select: {
      deviceId: true, name: true, hardwareId: true, apName: true,
      latitude: true, longitude: true, address: true,
      provisionedAt: true, lastSeenAt: true,
      // Bench units use the same install flow but skip the planned-site list
      // (they must never occupy a real deployment site) — the page needs the
      // flag to branch.
      isExperimental: true,
    },
  });

  if (!sensor) {
    return NextResponse.json(
      { token, known: false, state: "unknown_token" },
      { status: 404 }
    );
  }

  const latest = await prisma.reading.findFirst({
    where: { sensor: { deviceId: token } },
    orderBy: { receivedAt: "desc" },
    select: {
      receivedAt: true, laeq: true, frameCount: true,
      battery: true, rssi: true, freeHeapBytes: true, resetCause: true,
    },
  });

  const ageMs = latest ? Date.now() - latest.receivedAt.getTime() : null;
  const live = ageMs !== null && ageMs < LIVE_WINDOW_MS;

  // never_seen distinguishes "installed but not yet reporting" from "was working
  // and stopped" — the installer needs to know which of those they are looking at.
  const state = live ? "live" : latest ? "stale" : "never_seen";

  return NextResponse.json({
    token,
    known: true,
    state,
    live,
    hasLocation: sensor.latitude != null && sensor.longitude != null,
    sensor,
    lastReading: latest
      ? {
          receivedAt: latest.receivedAt,
          secondsAgo: Math.round((ageMs as number) / 1000),
          laeq: latest.laeq,
          frameCount: latest.frameCount,
          battery: latest.battery,
          rssi: latest.rssi,
          freeHeapBytes: latest.freeHeapBytes,
          resetCause: latest.resetCause,
        }
      : null,
  });
}
