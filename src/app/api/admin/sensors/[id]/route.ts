import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkFields, parseLatLon, readBody } from "@/lib/api/adminInput";
import { checkAdminAuth } from "../../auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const { id } = await params;
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Send a JSON object" }, { status: 400 });

  const sensor = await prisma.sensor.findUnique({ where: { id } });
  if (!sensor) {
    return NextResponse.json({ error: "Sensor not found" }, { status: 404 });
  }

  // A field dropped silently is how a no-op passes for success: a 400 naming
  // the field (unknown, or the wrong type) is recoverable; a 200 that
  // changed nothing is not. isExperimental was missing here once — minting
  // always accepted it, only the edit path could not change it.
  const fieldError = checkFields(body, {
    name: "string|null",
    address: "string|null",
    targetFirmwareVersion: "string|null",
    latitude: "number",
    longitude: "number",
    isActive: "boolean",
    isExperimental: "boolean",
    readingIntervalS: "number",
  });
  if (fieldError) return NextResponse.json({ error: fieldError }, { status: 400 });

  const data: Record<string, unknown> = { ...body };

  if (data.isActive === true && sensor.retiredAt) {
    return NextResponse.json({ error: "This token is retired; undo the retirement to show it again." }, { status: 409 });
  }
  if ("latitude" in data || "longitude" in data) {
    const at = parseLatLon(data.latitude, data.longitude);
    if (!at) return NextResponse.json({ error: "Send both latitude and longitude, as real coordinates." }, { status: 400 });
    Object.assign(data, at);
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
