// Alert rules: which incidents to open and close, and what the Discord
// message says. Pure — the ingester's evaluator gathers the numbers and
// applies the decisions. Shipped into the ingester image with the rest of
// src/lib/fleet.
//
// The rule that matters most: a silent unit pages within 30 minutes.
// Εξάρχεια went silent on Sep 10 and nobody knew for 20 days.
import { SILENT_CAUSE_TEXT, silentCause, type SilentCause } from "./status";

export const ALERT_SILENT_MS = 30 * 60 * 1000;
export const ALERT_ROUTER_RESTARTS_24H = 2;
export const ALERT_UNSCHEDULED_BOOTS_24H = 2;
export const ALERT_WEAK_RSSI_DBM = -72;

export type IncidentKind = "silent" | "router_restarts" | "unscheduled_restarts" | "weak_signal";

/** One installed unit, as the evaluator sees it. */
export interface AlertUnit {
  sensorId: string;
  title: string;
  apName: string | null;
  lastReceivedAt: Date | null;
  batteryLast: number | null;
  batteryMin1h: number | null;
  batteryMax1h: number | null;
  /** Mean signal over the last hour heard. */
  rssiAvg1h: number | null;
  unscheduledBoots24h: number;
  routerRestarts24h: number;
}

export interface OpenIncident { id: bigint | number; sensorId: string; kind: IncidentKind }

export interface Decision {
  /** `since`: when the condition began — a silence is dated from the last
   *  reading plus the threshold, not from whenever the evaluator noticed
   *  (after a deploy, or for a unit silent for weeks, those differ by days). */
  open: { sensorId: string; kind: IncidentKind; cause: SilentCause | null; evidence: Record<string, unknown>; since: Date }[];
  close: (bigint | number)[];
}

/** What is true right now, per unit and kind. */
export function conditions(u: AlertUnit, now: Date): Map<IncidentKind, Record<string, unknown>> {
  const out = new Map<IncidentKind, Record<string, unknown>>();
  const silentFor = u.lastReceivedAt ? now.getTime() - u.lastReceivedAt.getTime() : Infinity;
  if (silentFor >= ALERT_SILENT_MS) {
    out.set("silent", {
      lastReceivedAt: u.lastReceivedAt?.toISOString() ?? null,
      batteryLast: u.batteryLast,
      rssiAvg1h: u.rssiAvg1h,
      routerRestarts24h: u.routerRestarts24h,
    });
    return out; // a silent unit's other signals are stale; the silence is the incident
  }
  if (u.routerRestarts24h >= ALERT_ROUTER_RESTARTS_24H) out.set("router_restarts", { count: u.routerRestarts24h });
  if (u.unscheduledBoots24h >= ALERT_UNSCHEDULED_BOOTS_24H) out.set("unscheduled_restarts", { count: u.unscheduledBoots24h });
  if (u.rssiAvg1h != null && u.rssiAvg1h < ALERT_WEAK_RSSI_DBM) out.set("weak_signal", { rssiAvg1h: Math.round(u.rssiAvg1h) });
  return out;
}

/** Open what became true, close what stopped being true. One open per (unit, kind). */
export function evaluate(units: AlertUnit[], open: OpenIncident[], now: Date): Decision {
  const decision: Decision = { open: [], close: [] };
  const openKey = new Map(open.map((i) => [`${i.sensorId}:${i.kind}`, i]));
  const seen = new Set<string>();
  for (const u of units) {
    for (const [kind, evidence] of conditions(u, now)) {
      const key = `${u.sensorId}:${kind}`;
      seen.add(key);
      if (!openKey.has(key)) {
        const cause = kind === "silent"
          ? silentCause({ batteryMin: u.batteryMin1h, batteryMax: u.batteryMax1h, batteryLast: u.batteryLast })
          : null;
        const since = kind === "silent" && u.lastReceivedAt
          ? new Date(u.lastReceivedAt.getTime() + ALERT_SILENT_MS)
          : now;
        decision.open.push({ sensorId: u.sensorId, kind, cause, evidence, since });
      }
    }
  }
  const evaluated = new Set(units.map((u) => u.sensorId));
  for (const i of open) {
    // Units no longer evaluated (retired, uninstalled) close too.
    if (!seen.has(`${i.sensorId}:${i.kind}`) || !evaluated.has(i.sensorId)) decision.close.push(i.id);
  }
  return decision;
}

const KIND_TITLE: Record<IncidentKind, string> = {
  silent: "is silent",
  router_restarts: "store router keeps restarting",
  unscheduled_restarts: "is restarting on its own",
  weak_signal: "has a weak wifi signal",
};

const COLOR = { open: 0xb3362a, watch: 0xd1962a, resolved: 0x4d8f66 };

function duration(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 90) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
}

/** The Discord webhook body for an incident opening or closing. */
export function discordMessage(
  inc: { kind: IncidentKind; cause: string | null; openedAt: Date; closedAt: Date | null; evidence: Record<string, unknown> | null },
  unit: { title: string; apName: string | null; sensorId: string },
  adminBaseUrl: string | null,
): { content: string; embeds: object[] } {
  const box = unit.apName?.replace(/^Soundwatch-/, "") ?? unit.sensorId.slice(0, 8);
  const resolved = inc.closedAt != null;
  const ev = inc.evidence ?? {};
  const lines: string[] = [];
  if (!resolved && inc.kind === "silent") {
    lines.push(SILENT_CAUSE_TEXT[(inc.cause as SilentCause) ?? "unknown"]);
    if (typeof ev.batteryLast === "number") lines.push(`Battery ${Math.round(ev.batteryLast)}% at the last reading.`);
    if (typeof ev.routerRestarts24h === "number" && ev.routerRestarts24h > 0) {
      lines.push(`The store’s router restarted ${ev.routerRestarts24h}× in the day before.`);
    }
  } else if (!resolved && typeof ev.count === "number") {
    lines.push(`${ev.count} times in the last 24 h.`);
  } else if (!resolved && typeof ev.rssiAvg1h === "number") {
    lines.push(`${ev.rssiAvg1h} dBm average over the last hour.`);
  }
  if (resolved) lines.push(`Back after ${duration(inc.closedAt!.getTime() - inc.openedAt.getTime())}.`);

  const title = resolved
    ? `✓ ${unit.title} (${box}) — resolved`
    : `${unit.title} (${box}) ${KIND_TITLE[inc.kind]}`;
  const url = adminBaseUrl ? `${adminBaseUrl.replace(/\/$/, "")}/admin/units/${unit.sensorId}` : undefined;
  return {
    content: "",
    embeds: [{
      title,
      description: lines.join("\n"),
      color: resolved ? COLOR.resolved : inc.kind === "silent" ? COLOR.open : COLOR.watch,
      ...(url ? { url } : {}),
      timestamp: (inc.closedAt ?? inc.openedAt).toISOString(),
    }],
  };
}
