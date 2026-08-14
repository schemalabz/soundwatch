// Sensor outage model: units occasionally go dark (router unplugged, power
// cut, wifi change, stolen router — all of which have happened to the real
// fleet) for anywhere from a minute to ten days.
//
// Deterministic like everything else in the simulator: online-ness is a pure
// function of (deviceId, t), so the backfill's gaps line up exactly with what
// the live streamer would have skipped, across processes and re-runs.
//
// Mechanics: time is cut into fixed windows; each window may start at most
// one outage (hash-decided), with a log-uniform duration — most outages are
// minutes-to-hours blips, the tail is multi-day. Per-sensor flakiness is
// itself hash-assigned and quadratically skewed, so the fleet has a majority
// of solid units and a few recurring problem children, like real deployments.

import { rand01 } from "./random";

const WINDOW_S = 3 * 86400;
export const MIN_OUTAGE_S = 60;
export const MAX_OUTAGE_S = 10 * 86400;
const LOG_MIN = Math.log(MIN_OUTAGE_S);
const LOG_SPAN = Math.log(MAX_OUTAGE_S) - LOG_MIN;
// An outage can start up to MAX_OUTAGE_S before t and still cover it.
const LOOKBACK_WINDOWS = Math.ceil(MAX_OUTAGE_S / WINDOW_S) + 1;

/**
 * Chance that a given 3-day window starts an outage, per sensor. Squaring
 * skews the fleet: the median unit is solid (~98% uptime), the flakiest
 * few percent of units carry most of the downtime.
 */
function flakiness(deviceId: string): number {
  const r = rand01(deviceId, "flaky", 0);
  return 0.3 * r * r;
}

interface Outage {
  startS: number;
  endS: number;
}

/** The outage started in window w, if any. */
function outageInWindow(deviceId: string, w: number): Outage | null {
  if (rand01(deviceId, "outage", w) >= flakiness(deviceId)) return null;
  const startS = w * WINDOW_S + Math.floor(rand01(deviceId, "outage-start", w) * WINDOW_S);
  const durS = Math.round(Math.exp(LOG_MIN + rand01(deviceId, "outage-dur", w) * LOG_SPAN));
  return { startS, endS: startS + durS };
}

/** Is the sensor publishing at time t? */
export function isOnline(deviceId: string, tSec: number): boolean {
  const w0 = Math.floor(tSec / WINDOW_S);
  for (let w = w0 - LOOKBACK_WINDOWS; w <= w0; w++) {
    const o = outageInWindow(deviceId, w);
    if (o && tSec >= o.startS && tSec < o.endS) return false;
  }
  return true;
}

/**
 * When the device last powered back up after an outage, or null if no outage
 * ended in the lookback horizon. Used to reset the diagnostics uptime counter
 * — a unit that just came back reports seconds of uptime, not weeks.
 */
export function lastOutageEndBefore(deviceId: string, tSec: number): number | null {
  const w0 = Math.floor(tSec / WINDOW_S);
  let latest: number | null = null;
  for (let w = w0 - LOOKBACK_WINDOWS; w <= w0; w++) {
    const o = outageInWindow(deviceId, w);
    if (o && o.endS <= tSec && (latest == null || o.endS > latest)) latest = o.endS;
  }
  return latest;
}
