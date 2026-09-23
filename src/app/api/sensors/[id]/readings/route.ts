import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canViewSensor, NO_SHARED_CACHE } from "@/lib/server/sensorAccess";
import { READING_SELECT, serializeReading } from "@/lib/api/readings";
import { ReadingsQuerySchema, type ApiReadingsResponse } from "@/lib/api/schemas";
import { csvFilename, readingsToCsv } from "@/lib/api/csv";

// Every response below carries NO_SHARED_CACHE — the 200s, the 404 and the
// 400 alike, the CSV included. The rule lives beside the gate that makes it
// necessary.

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);

  const parsed = ReadingsQuerySchema.safeParse(
    Object.fromEntries(url.searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid query",
        issues: parsed.error.issues.map(
          (i) => `${i.path.join(".")}: ${i.message}`
        ),
      },
      { status: 400, headers: NO_SHARED_CACHE }
    );
  }
  const { from, to, receivedFrom } = parsed.data;
  const limit = parsed.data.limit ?? 1000;

  const sensor = await prisma.sensor.findUnique({ where: { id } });
  // Bench units (isExperimental) are not public. 404 rather than 403 so their
  // existence is not confirmable without a credential (admin or share key).
  if (!sensor || !canViewSensor(request, sensor)) {
    return NextResponse.json(
      { error: "Sensor not found" },
      { status: 404, headers: NO_SHARED_CACHE }
    );
  }

  const where: {
    sensorId: string;
    recordedAt?: { gte?: Date; lte?: Date };
    receivedAt?: { gte?: Date };
  } = { sensorId: id };

  // from/to filter on the device clock — that is what a chart x-axis wants —
  // but ordering must be receivedAt: device clocks run up to ~35 min ahead and
  // jump back on NTP resync, so sorting on recordedAt silently drops
  // recently-received rows from a drifting unit.
  if (from || to) {
    where.recordedAt = {};
    if (from) where.recordedAt.gte = new Date(from);
    if (to) where.recordedAt.lte = new Date(to);
  }

  // receivedFrom is the server-clock counterpart: "everything that has arrived
  // since X". A caller wanting a live window wants this, because 28.65% of
  // production rows arrive after their device stamp (store-and-forward replay,
  // lagging clocks) and a recordedAt floor drops rows that just landed. Both
  // filters may be given together; they AND.
  if (receivedFrom) where.receivedAt = { gte: new Date(receivedFrom) };

  const readings = await prisma.reading.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    take: limit,
    select: READING_SELECT,
  });

  const serialized = readings.map(serializeReading);

  if (parsed.data.format === "csv") {
    const name = csvFilename(sensor.name, id, from, to);
    // Header values are ByteStrings: a Greek name in the plain filename= would
    // throw before the response is built. RFC 6266: an ASCII fallback in
    // filename=, the real name percent-encoded in filename*=. A name with no
    // ASCII letter or digit at all (fully Greek, say) leaves nothing between
    // "soundwatch-" and the window part once stripped to ASCII — fall back to
    // the id there instead of shipping a filename of bare dashes.
    const asciiSafeName =
      !sensor.name || /[A-Za-z0-9]/.test(sensor.name) ? name : csvFilename(null, id, from, to);
    const ascii = asciiSafeName.replace(/[^\x20-\x7E]/g, "-").replace(/["\\]/g, "");
    // The CSV body is buffered in memory, not streamed — fine at fleet size.
    return new Response(readingsToCsv(serialized), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        ...NO_SHARED_CACHE,
      },
    });
  }

  // Annotated with the type ReadingsResponseSchema documents and the client
  // imports — the same reason as the detail route above.
  const payload: ApiReadingsResponse = {
    sensorId: id,
    count: serialized.length,
    readings: serialized,
  };

  return NextResponse.json(payload, { headers: NO_SHARED_CACHE });
}
