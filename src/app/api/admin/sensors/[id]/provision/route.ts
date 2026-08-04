import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "../../../auth";

/**
 * Record what only the provisioning bench knows about a unit.
 *
 * A device self-reports its hardware id on device/sck/<token>/info — but only
 * once it has WiFi, which for a field unit is at the customer site. Registering
 * here means the label data exists server-side BEFORE the unit ships, so the
 * install page can say "this should be hardware 618E7DEC…" and catch a box that
 * was swapped during installation. Without it there is nothing to compare against
 * at the only moment the comparison would help.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  // The route segment is [id] to match the sibling admin routes, but the value
  // here is the device token (sensors.device_id) — that is what the bench has.
  const { id: token } = await params;
  const body = await request.json().catch(() => ({}));
  const { hardwareId, apName, samVersion, espVersion, readingIntervalS } = body;

  const sensor = await prisma.sensor.findUnique({ where: { deviceId: token } });
  if (!sensor) {
    return NextResponse.json(
      { error: `No sensor registered for token '${token}' — mint it first` },
      { status: 404 }
    );
  }

  // A hardware id that changes under a known token means two physical units were
  // swapped. Refuse rather than overwrite: silently accepting it would relabel
  // every past reading from both boxes.
  if (sensor.hardwareId && hardwareId && sensor.hardwareId !== hardwareId) {
    return NextResponse.json(
      {
        error: "hardware mismatch",
        detail: `token '${token}' was provisioned as ${sensor.hardwareId} but is now ${hardwareId}`,
      },
      { status: 409 }
    );
  }

  const updated = await prisma.sensor.update({
    where: { deviceId: token },
    data: {
      ...(hardwareId ? { hardwareId } : {}),
      ...(apName ? { apName } : {}),
      ...(samVersion || espVersion
        ? { firmwareVersion: [samVersion, espVersion].filter(Boolean).join(" / ") }
        : {}),
      // The interval the bench actually wrote to the device. Until now nothing
      // ever set this, so every sensor displayed the schema default of 60 while
      // the fleet ran at 30 — the column was aspirational and, worse, aspirational
      // about a value nobody had ever typed. Provisioning is the one moment the
      // configured interval is known for certain, so it is recorded here.
      // Anything >= 60 is refused: the ESP powers down between publishes at that
      // point, which is the same limit onboard.sh enforces on the device side.
      ...(Number.isInteger(readingIntervalS) && readingIntervalS > 0 && readingIntervalS < 60
        ? { readingIntervalS }
        : {}),
      provisionedAt: new Date(),
    },
  });

  return NextResponse.json({
    token: updated.deviceId,
    hardwareId: updated.hardwareId,
    apName: updated.apName,
    firmwareVersion: updated.firmwareVersion,
    readingIntervalS: updated.readingIntervalS,
    provisionedAt: updated.provisionedAt,
    installUrl: `/install/${updated.deviceId}`,
  });
}
