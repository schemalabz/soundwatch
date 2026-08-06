import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "../../auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json();

  const sensor = await prisma.sensor.findUnique({ where: { id } });
  if (!sensor) {
    return NextResponse.json({ error: "Sensor not found" }, { status: 404 });
  }

  const allowedFields = [
    "name",
    "latitude",
    "longitude",
    "address",
    "isActive",
    "readingIntervalS",
    "targetFirmwareVersion",
    // Was missing, and its absence was invisible: an unknown field is dropped
    // and the request still returns 200 with the unchanged sensor, so "flag this
    // bench unit experimental" looked like it had worked while the unit stayed
    // on the public map. Minting has always accepted isExperimental; only the
    // edit path could not change it.
    "isExperimental",
  ] as const;

  const data: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const key of Object.keys(body)) {
    if ((allowedFields as readonly string[]).includes(key)) data[key] = body[key];
    else rejected.push(key);
  }
  // Dropping a field the caller clearly meant is how a no-op passes for success.
  // A 400 naming the field is recoverable; a 200 that changed nothing is not.
  if (rejected.length > 0) {
    return NextResponse.json(
      { error: `Unknown or non-editable field(s): ${rejected.join(", ")}` },
      { status: 400 }
    );
  }

  const updated = await prisma.sensor.update({ where: { id }, data });
  return NextResponse.json(updated);
}

/**
 * Delete a sensor and everything recorded under its token.
 *
 * Two-phase by design — the confirmation lives in the API, not just the UI:
 *  - DELETE without acknowledgment deletes NOTHING; it answers 409 with exactly
 *    what would be lost (reading count, framelog chunks, last-seen recency).
 *  - Only a request whose body echoes the exact deviceId executes, and then in
 *    one transaction, so a failure can never leave orphaned readings.
 *
 * Deletion does not deprovision the physical device: a box still publishing
 * under this token will re-mint a clean row on its next message. For "keep the
 * history but hide it", use PATCH isActive:false instead.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const sensor = await prisma.sensor.findUnique({ where: { id } });
  if (!sensor) {
    return NextResponse.json({ error: "Sensor not found" }, { status: 404 });
  }

  const [readings, framelogChunks] = await Promise.all([
    prisma.reading.count({ where: { sensorId: id } }),
    prisma.frameLogChunk.count({ where: { deviceId: sensor.deviceId } }),
  ]);

  if (body.acknowledge !== sensor.deviceId) {
    return NextResponse.json(
      {
        error: "confirmation required",
        detail:
          "Re-send with { acknowledge: \"<deviceId>\" } to permanently delete this sensor and everything below.",
        deviceId: sensor.deviceId,
        wouldDelete: { readings, framelogChunks },
        lastSeenAt: sensor.lastSeenAt,
      },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.reading.deleteMany({ where: { sensorId: id } }),
    prisma.frameLogChunk.deleteMany({ where: { deviceId: sensor.deviceId } }),
    prisma.sensor.delete({ where: { id } }),
  ]);

  return NextResponse.json({
    deleted: sensor.deviceId,
    readingsDeleted: readings,
    framelogChunksDeleted: framelogChunks,
  });
}
