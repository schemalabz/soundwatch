import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { READING_SELECT, serializeReading } from "@/lib/api/readings";
import type { ApiSensorDetail } from "@/lib/api/schemas";
import { canViewSensor, NO_SHARED_CACHE } from "@/lib/server/sensorAccess";

// Every response below carries NO_SHARED_CACHE — the 200 and the 404 alike.
// The rule lives beside the gate that makes it necessary.

export const dynamic = "force-dynamic";

/** One 404, byte-identical whichever step produced it. */
const notFound = () =>
  NextResponse.json(
    { error: "Sensor not found" },
    { status: 404, headers: NO_SHARED_CACHE }
  );

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // The gate runs against a two-column lookup BEFORE the row and its latest
  // reading are loaded, because the work done before a 404 is itself a signal.
  // Loading first made a hidden sensor's 404 measurably slower than an unknown
  // id's: 200 interleaved samples each, 2.98 ms median for a nonexistent id
  // against 5.38 ms for a bench unit — enough to confirm a bench unit exists
  // without holding a credential, which is exactly what the 404 is for. The
  // readings route gates before it queries and is indistinguishable (2.88 vs
  // 2.82 ms); this route now matches it. The cost is one extra round trip on
  // the path that was already the slower of the two.
  const gate = await prisma.sensor.findUnique({
    where: { id },
    select: { isExperimental: true, shareKey: true },
  });

  // Bench units are not public. 404 rather than 403 so their existence is
  // not confirmable without a credential (admin token or share key).
  if (!gate || !canViewSensor(request, gate)) return notFound();

  const sensor = await prisma.sensor.findUnique({
    where: { id },
    include: {
      readings: {
        // receivedAt, not recordedAt: a drifting device clock must not decide
        // which reading is "latest".
        orderBy: { receivedAt: "desc" },
        take: 1,
        select: READING_SELECT,
      },
    },
  });

  // Deleted between the two queries: the same 404, same bytes.
  if (!sensor) return notFound();

  // Annotated with the type SensorDetailSchema documents and the client
  // imports, so the two cannot drift: isExperimental was declared in the
  // schema and emitted by /api/sensors while this route silently omitted it,
  // until someone noticed and hand-added it. A field missing here, or renamed,
  // now fails to compile rather than arriving as undefined.
  //
  // The dates are converted explicitly. NextResponse.json was serializing the
  // Date objects for us, which put the right bytes on the wire by accident:
  // the contract says string, and the route was handing it a Date.
  const payload: ApiSensorDetail = {
    id: sensor.id,
    name: sensor.name,
    latitude: sensor.latitude,
    longitude: sensor.longitude,
    address: sensor.address,
    firmwareVersion: sensor.firmwareVersion,
    readingIntervalS: sensor.readingIntervalS,
    isActive: sensor.isActive,
    isExperimental: sensor.isExperimental,
    lastSeenAt: sensor.lastSeenAt ? sensor.lastSeenAt.toISOString() : null,
    createdAt: sensor.createdAt.toISOString(),
    latestReading: sensor.readings[0]
      ? serializeReading(sensor.readings[0])
      : null,
  };

  return NextResponse.json(payload, { headers: NO_SHARED_CACHE });
}
