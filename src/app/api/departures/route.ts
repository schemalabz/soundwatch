import { NextRequest, NextResponse } from "next/server";
import { parseEpochMs } from "@/lib/dashboard/filters";
import { usualWindow } from "@/lib/dashboard/usual";
import { cachedTenMinuteWindows, departureEpisodes, fleetUsual } from "@/lib/server/usual";
import type { DeparturesResponse } from "@/lib/api/dashboard";

// «Σήμερα ξεχώρισαν»: the Athens day containing `at`, up to `at`, cut into
// ten-minute figures per public sensor and held against each sensor's usual
// band for that hour. Consecutive departing windows merge into one episode
// (start, peak, the band at the peak). The rail lists them newest first and
// a click scrubs the timebar to the episode's peak.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rawAt = req.nextUrl.searchParams.get("at");
  // Without at=, now to the minute: the dashboard always sends a
  // minute-aligned at, and a millisecond-unique one would never share the
  // cached day (see cachedTenMinuteWindows).
  const atMs = rawAt == null ? Math.floor(Date.now() / 60_000) * 60_000 : parseEpochMs(rawAt);
  if (atMs === null) {
    return NextResponse.json({ error: "at= requires epoch ms" }, { status: 400 });
  }
  const win = usualWindow(atMs);
  const [usual, windows] = await Promise.all([
    fleetUsual(win.dayStartMs, win.dayType),
    cachedTenMinuteWindows(win.dayStartMs, atMs),
  ]);
  const payload: DeparturesResponse = {
    at: atMs,
    dayStartMs: win.dayStartMs,
    dayType: win.dayType,
    episodes: departureEpisodes(windows, usual, atMs),
  };
  return NextResponse.json(payload);
}
