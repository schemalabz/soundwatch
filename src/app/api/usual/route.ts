import { NextRequest, NextResponse } from "next/server";
import { parseEpochMs } from "@/lib/dashboard/filters";
import { USUAL_MIN_BUCKETS, USUAL_WEEKS, usualWindow } from "@/lib/dashboard/usual";
import { fleetUsual } from "@/lib/server/usual";
import type { UsualBand, UsualDayResponse, UsualProfileResponse, UsualResponse } from "@/lib/api/dashboard";

// «Το συνηθισμένο»: for an instant, every public sensor's L90–L10 band for
// that Athens clock hour and kind of day over the past four weeks — what the
// map compares a circle's level against. With `day=1`, every hour of that
// day for the fleet, so playback across a day is one request. With
// `sensor=`, one sensor's band for every hour, which is what the pane draws
// the day's line over. The rule itself lives in src/lib/dashboard/usual.ts;
// the SQL and the cache in src/lib/server/usual.ts.

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const rawAt = q.get("at");
  const atMs = rawAt == null ? Date.now() : parseEpochMs(rawAt);
  if (atMs === null) {
    return NextResponse.json({ error: "at= requires epoch ms" }, { status: 400 });
  }
  const sensorParam = q.get("sensor");
  if (sensorParam != null && !UUID.test(sensorParam)) {
    return NextResponse.json({ error: "sensor= requires a sensor id" }, { status: 400 });
  }

  const win = usualWindow(atMs);
  const fleet = await fleetUsual(win.dayStartMs, win.dayType);

  if (sensorParam) {
    // A bench or unsited unit never enters the fleet map (the rollup query
    // carries the public predicate), so an unknown or private id simply has
    // no hours — indistinguishable from a public unit with no history.
    const hours: Record<number, UsualBand> = {};
    for (const [hour, band] of fleet.get(sensorParam) ?? []) hours[hour] = band;
    const payload: UsualProfileResponse = {
      at: atMs,
      sensorId: sensorParam,
      dayType: win.dayType,
      weeks: USUAL_WEEKS,
      minBuckets: USUAL_MIN_BUCKETS,
      hours,
    };
    return NextResponse.json(payload);
  }

  if (q.get("day") === "1") {
    const sensors: Record<string, Record<number, UsualBand>> = {};
    for (const [id, hours] of fleet) {
      if (hours.size === 0) continue;
      sensors[id] = Object.fromEntries(hours);
    }
    const payload: UsualDayResponse = {
      at: atMs,
      dayStartMs: win.dayStartMs,
      dayType: win.dayType,
      weeks: USUAL_WEEKS,
      minBuckets: USUAL_MIN_BUCKETS,
      sensors,
    };
    return NextResponse.json(payload);
  }

  const sensors: Record<string, UsualBand> = {};
  for (const [id, hours] of fleet) {
    const band = hours.get(win.hour);
    if (band) sensors[id] = band;
  }
  const payload: UsualResponse = {
    at: atMs,
    hour: win.hour,
    dayType: win.dayType,
    weeks: USUAL_WEEKS,
    minBuckets: USUAL_MIN_BUCKETS,
    sensors,
  };
  return NextResponse.json(payload);
}
