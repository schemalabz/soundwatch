// Fleet status: what the admin calls a unit, and why. Pure functions only —
// the fleet API, the unit page and the incident evaluator all decide through
// here, so a threshold changes in one place and its truth table is tested.
//
// Every rule below came out of the Sep 30 investigation of the Skroutz fleet
// (see docs/superpowers/specs/2026-10-03-admin-redesign-design.md).

/** No arrival for this long = silent. Units report every ~30 s. */
export const SILENT_AFTER_MS = 15 * 60 * 1000;

/** "Watch": a live unit whose last 24 h look unhealthy. */
export const WATCH_RSSI_DBM = -70;
export const WATCH_UNSCHEDULED_BOOTS = 2;
export const WATCH_ROUTER_RESTARTS = 2;

/** A row that arrived within this of its own timestamp counts as on time.
 *  Wider than device clock drift (~25 min/day, reset at 06:00). Mirrors the
 *  readings_hour_health definition in scripts/timescale-objects.ts. */
export const ON_TIME_MS = 30 * 60 * 1000;

export type FleetStatus =
  | "retired"
  | "bench"
  | "minted"
  | "in_box"
  | "with_installer"
  | "live"
  | "watch"
  | "silent";

export interface StatusInput {
  retiredAt: Date | null;
  /** false = hidden from the public; a unit switched off before retirement
   *  existed (sck-exarchia) counts as retired. Defaults to true. */
  isActive?: boolean;
  isExperimental: boolean;
  provisionedAt: Date | null;
  handedOverAt: Date | null;
  installedAt: Date | null;
  /** Newest server-side arrival. Never the device clock. */
  lastReceivedAt: Date | null;
}

export interface Last24h {
  /** Mean wifi signal over readings that reported one; null = none did. */
  rssiAvg: number | null;
  unscheduledBoots: number;
  routerRestarts: number;
}

export function lifecycleStatus(s: StatusInput, now: Date): FleetStatus {
  if (s.retiredAt || s.isActive === false) return "retired";
  if (s.isExperimental) return "bench";
  if (!s.installedAt) {
    if (s.handedOverAt) return "with_installer";
    return s.provisionedAt ? "in_box" : "minted";
  }
  const heard = s.lastReceivedAt != null && now.getTime() - s.lastReceivedAt.getTime() < SILENT_AFTER_MS;
  return heard ? "live" : "silent";
}

/** Reasons a live unit is on the watch list; empty = healthy. */
export function watchReasons(h: Last24h): string[] {
  const out: string[] = [];
  if (h.rssiAvg != null && h.rssiAvg < WATCH_RSSI_DBM) out.push(`weak wifi signal (${Math.round(h.rssiAvg)} dBm)`);
  if (h.unscheduledBoots >= WATCH_UNSCHEDULED_BOOTS) out.push(`${h.unscheduledBoots} unscheduled restarts`);
  if (h.routerRestarts >= WATCH_ROUTER_RESTARTS) out.push(`store router restarted ${h.routerRestarts} times`);
  return out;
}

export function fleetStatus(s: StatusInput, h: Last24h, now: Date): FleetStatus {
  const base = lifecycleStatus(s, now);
  if (base === "live" && watchReasons(h).length > 0) return "watch";
  return base;
}

/**
 * The daily restart is scheduled at 03:00 UTC by the DEVICE's clock, which
 * drifts up to ~25 min either way — and a fast clock restarts twice (once by
 * its drifted clock, once after the resync). 05:00–07:00 Athens covers both.
 */
export function isScheduledBoot(at: Date): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", hour: "2-digit", hour12: false }).format(at)
  );
  return hour >= 5 && hour < 7;
}

/** A reading's uptime is lower than the one before it: the unit restarted. */
export function isBoot(prevUptimeS: number | null | undefined, uptimeS: number | null | undefined): boolean {
  return prevUptimeS != null && uptimeS != null && uptimeS < prevUptimeS;
}

export type SilentCause = "network_lost_powered" | "on_battery" | "unknown";

/**
 * Why a silent unit stopped, from the last hour it was heard.
 *
 * Every box has a rechargeable battery that charges on mains. A unit that lost
 * mains keeps running — and uploading — on battery, so its level falls in the
 * readings we DO have. A unit that stopped at a full, steady battery still had
 * power: what vanished was the store's network. Thresholds are deliberately
 * coarse; a battery reading of 0 means "flat or not connected" and decides
 * nothing.
 */
export function silentCause(lastHour: { batteryMin: number | null; batteryMax: number | null; batteryLast: number | null }): SilentCause {
  const { batteryMin, batteryMax, batteryLast } = lastHour;
  if (batteryLast == null || batteryLast <= 0) return "unknown";
  if (batteryMax != null && batteryMin != null && batteryMax - batteryMin >= 3 && batteryLast <= batteryMin + 1) {
    return "on_battery";
  }
  if (batteryLast >= 90) return "network_lost_powered";
  return "unknown";
}

export const SILENT_CAUSE_TEXT: Record<SilentCause, string> = {
  network_lost_powered: "The store’s internet went away. The sensor still had power.",
  on_battery: "The sensor lost mains power and ran on its battery.",
  unknown: "Cause unknown from the data we have.",
};

/** One cell of a liveness strip, from the rollup's counts for that span. */
export type CellState = "live" | "offline" | "silent" | "none";

/**
 * live    = something arrived on time;
 * offline = measured, but every row was uploaded later (store-and-forward);
 * silent  = installed and nothing measured;
 * none    = not installed yet / not deployed (nothing expected).
 */
export function cellState(n: number, nOnTime: number, expected: boolean): CellState {
  if (nOnTime > 0) return "live";
  if (n > 0) return "offline";
  return expected ? "silent" : "none";
}
