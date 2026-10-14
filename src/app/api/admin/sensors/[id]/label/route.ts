import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "../../../auth";

// Node runtime: the renderer is a native module.
export const runtime = "nodejs";

/**
 * The print-ready label for one unit, as a PNG at the printer's native size.
 *
 * Exists so the bench can print labels as part of provisioning — onboard.sh
 * already talks to this API with SW_ADMIN_TOKEN at the moment the label data
 * comes into being. /admin shows the same bytes, so the preview cannot drift
 * from what prints. Rendered on every request: the label is a view of the
 * sensor row, never a stored artifact, so re-provision then reprint is current.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  // [id] matches the sibling admin routes, but like /provision the value is the
  // device token — that is what the bench has in hand.
  const { id: token } = await params;
  const sensor = await prisma.sensor.findUnique({
    where: { deviceId: token },
    include: { plannedLocation: { select: { name: true } } },
  });
  if (!sensor) {
    return NextResponse.json({ error: `No sensor registered for token '${token}'` }, { status: 404 });
  }
  if (!sensor.apName) {
    return NextResponse.json(
      { error: "not provisioned", detail: "the label needs the setup AP name, which only provisioning records" },
      { status: 409 }
    );
  }

  // Lazy: the native Skia module and fonts load on the first label request,
  // not when the server boots — nothing else on the server pays for them.
  const { renderLabel } = await import("@/lib/label/render");
  // Same name the admin inventory shows for the unit: its site, else its own name.
  const png = await renderLabel({
    deviceId: sensor.deviceId,
    name: sensor.plannedLocation?.name ?? sensor.name,
    apName: sensor.apName,
    hardwareId: sensor.hardwareId,
  });
  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "content-disposition": `inline; filename="label-${sensor.deviceId}.png"`,
      "cache-control": "no-store",
    },
  });
}
