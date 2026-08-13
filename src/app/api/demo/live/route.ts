import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "@/app/api/admin/auth";

// Bench demo endpoint: exposes the Soundwatch acoustic measurements that the
// product API deliberately does not carry yet (it still selects the stock
// sensor fields, where noiseDba is null under this firmware). Read-only, and
// scoped to recent data so it stays cheap to poll.
export const dynamic = "force-dynamic";

const WINDOW_MINUTES = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const minutes = Math.min(
    parseInt(url.searchParams.get("minutes") ?? String(WINDOW_MINUTES), 10) || WINDOW_MINUTES,
    360
  );
  const since = new Date(Date.now() - minutes * 60_000);

  // Bench units are not public — even on the demo feed. Admins can ask for
  // them with the same gate the sensor list uses.
  const wantsExperimental =
    url.searchParams.get("includeExperimental") === "1" &&
    checkAdminAuth(request) === null;

  const sensors = await prisma.sensor.findMany({
    where: wantsExperimental ? {} : { isExperimental: false },
    // deviceId is the install credential (POST /api/install/{token}/location
    // authenticates with nothing else), so it never leaves an unauthenticated
    // route. The public id keys this feed instead.
    select: { id: true, name: true, lastSeenAt: true },
    orderBy: { id: "asc" },
  });

  const readings = await prisma.reading.findMany({
    // receivedAt, not recordedAt: a store-and-forward replay carries an old
    // device clock, and the demo is about what is arriving *now*.
    where: {
      sensorId: { in: sensors.map((s) => s.id) },
      receivedAt: { gte: since },
      laeq: { not: null },
    },
    orderBy: { receivedAt: "asc" },
    select: {
      sensorId: true,
      recordedAt: true,
      receivedAt: true,
      laeq: true,
      l10: true,
      l50: true,
      l90: true,
      lmaxEst: true,
      lminEst: true,
      realizedDuty: true,
      frameCount: true,
      intervalS: true,
      histRaw: true,
      bandsDb: true,
    },
  });

  const devices = new Map<string, typeof readings>();
  for (const s of sensors) devices.set(s.id, []);
  for (const r of readings) devices.get(r.sensorId)?.push(r);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    windowMinutes: minutes,
    devices: [...devices.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sensorId, rows]) => ({
        sensorId,
        name: sensors.find((s) => s.id === sensorId)?.name ?? null,
        lastSeenAt: sensors.find((s) => s.id === sensorId)?.lastSeenAt ?? null,
        count: rows.length,
        latest: rows[rows.length - 1] ?? null,
        series: rows.map((r) => ({
          t: r.receivedAt,
          laeq: r.laeq,
          l10: r.l10,
          l50: r.l50,
          l90: r.l90,
          duty: r.realizedDuty,
          frames: r.frameCount,
        })),
      })),
  });
}
