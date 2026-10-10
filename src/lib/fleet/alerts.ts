// Alert rules: which incidents to open and close, and what the Discord
// message says. Pure — the ingester's evaluator gathers the numbers and
// applies the decisions. Shipped into the ingester image with the rest of
// src/lib/fleet.
//
// The rule that matters most: a silent unit pages within 30 minutes.
// Εξάρχεια went silent on Sep 10 and nobody knew for 20 days.
import { needsCharge, SILENT_CAUSE_TEXT, silentCause, type SilentCause } from "./status";

export const ALERT_SILENT_MS = 30 * 60 * 1000;
export const ALERT_ROUTER_RESTARTS_24H = 2;
export const ALERT_UNSCHEDULED_BOOTS_24H = 2;
export const ALERT_WEAK_RSSI_DBM = -72;
/** Hysteresis: a weak-signal incident resolves only above this, so a unit
 *  hovering around −72 dBm does not open and resolve every minute. */
export const ALERT_WEAK_RSSI_CLEAR_DBM = -69;

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
  /** When the installer finished; null = not installed. */
  installedAt: Date | null;
}

export interface OpenIncident { id: bigint | number; sensorId: string; kind: IncidentKind }

export interface Decision {
  /** `since`: when the condition began — a silence is dated from the last
   *  reading plus the threshold, not from whenever the evaluator noticed
   *  (after a deploy, or for a unit silent for weeks, those differ by days). */
  open: { sensorId: string; kind: IncidentKind; cause: SilentCause | null; evidence: Record<string, unknown>; since: Date }[];
  /** Resolved: announce it. */
  close: (bigint | number)[];
  /** The unit left the evaluation (retired, uninstalled): close without a
   *  "resolved" message — nothing came back. */
  closeQuiet: (bigint | number)[];
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
      installedAt: u.installedAt?.toISOString() ?? null,
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
  const decision: Decision = { open: [], close: [], closeQuiet: [] };
  const openKey = new Map(open.map((i) => [`${i.sensorId}:${i.kind}`, i]));
  const seen = new Set<string>();
  const silentUnits = new Set<string>();
  for (const u of units) {
    const now_ = conditions(u, now);
    if (now_.has("silent")) silentUnits.add(u.sensorId);
    // Hysteresis: an open weak-signal incident holds until the signal clears.
    if (!now_.has("weak_signal") && openKey.has(`${u.sensorId}:weak_signal`) && !now_.has("silent")
        && (u.rssiAvg1h == null || u.rssiAvg1h <= ALERT_WEAK_RSSI_CLEAR_DBM)) {
      seen.add(`${u.sensorId}:weak_signal`);
    }
    for (const [kind, evidence] of now_) {
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
    if (!evaluated.has(i.sensorId)) { decision.closeQuiet.push(i.id); continue; }
    if (seen.has(`${i.sensorId}:${i.kind}`)) continue;
    // A silent unit's other incidents are not resolved — we just cannot see
    // them. They stay open until it is back and they clear.
    if (silentUnits.has(i.sensorId)) continue;
    decision.close.push(i.id);
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

/** When the problem began: a silence began at the last reading, 30 minutes
 *  before the incident opened; everything else at the opening. */
export function outageStart(inc: { kind: IncidentKind; openedAt: Date; evidence: Record<string, unknown> | null }): Date {
  const last = inc.evidence?.lastReceivedAt;
  return inc.kind === "silent" && typeof last === "string" ? new Date(last) : inc.openedAt;
}

/** How each kind of incident ends. Only a silence was "away". */
const RESOLVED_LINE: Record<IncidentKind, (open: string) => string> = {
  silent: (d) => `Back after ${d}.`,
  router_restarts: (d) => `Fewer than ${ALERT_ROUTER_RESTARTS_24H} router restarts in the last 24 h (open ${d}).`,
  unscheduled_restarts: (d) => `Fewer than ${ALERT_UNSCHEDULED_BOOTS_24H} unscheduled restarts in the last 24 h (open ${d}).`,
  weak_signal: (d) => `Signal back above ${ALERT_WEAK_RSSI_CLEAR_DBM} dBm (open ${d}).`,
};

/** A silence this soon after installation is about power, not the store. */
const STOPPED_AFTER_INSTALL_MS = 3600_000;

/** What the person reading the alert should do next. Starts with a verb. */
export function whatToDo(inc: { kind: IncidentKind; cause: string | null; evidence: Record<string, unknown> | null }): string {
  const ev = inc.evidence ?? {};
  switch (inc.kind) {
    case "silent": {
      const installed = typeof ev.installedAt === "string" ? Date.parse(ev.installedAt) : NaN;
      const last = typeof ev.lastReceivedAt === "string" ? Date.parse(ev.lastReceivedAt) : NaN;
      if (Math.abs(last - installed) < STOPPED_AFTER_INSTALL_MS) return "Check it is plugged into a socket that has power: it stopped right after installation.";
      if (inc.cause === "network_lost_powered") return "Ask the store to check its router and internet.";
      if (inc.cause === "on_battery") return "Check the socket: the unit lost mains power and ran on its battery.";
      if (typeof ev.batteryLast === "number" && needsCharge(ev.batteryLast)) {
        return "Check the unit has power, and charge it: its battery is too low to tell a power cut from an internet outage.";
      }
      return "Check the unit has power and the store's internet is up.";
    }
    case "router_restarts": return "Ask the store about its internet: the router keeps re-dialling.";
    case "unscheduled_restarts": return "Check the unit's power supply: it keeps restarting on its own.";
    case "weak_signal": return "Ask the store to move the router closer, or add a wifi extender.";
  }
}

/** Markdown links for the message body; each only when it can be built. */
export function messageLinks(u: { sensorId: string; latitude: number | null; longitude: number | null }, adminBaseUrl: string | null): string {
  const out: string[] = [];
  if (adminBaseUrl) out.push(`[Open in admin](${adminBaseUrl.replace(/\/$/, "")}/admin/units/${u.sensorId})`);
  if (u.latitude != null && u.longitude != null) out.push(`[Map](https://www.google.com/maps?q=${u.latitude},${u.longitude})`);
  return out.join(" · ");
}

/** Athens wall time, "28 Sept, 11:37". */
export function athensTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}
const athensDay = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", day: "numeric", month: "short" }).format(d);

export interface MessageUnit {
  title: string;
  apName: string | null;
  sensorId: string;
  latitude: number | null;
  longitude: number | null;
  /** The unit's newest note, shown under the alert. */
  latestNote: { body: string; createdAt: Date } | null;
}

export type InstallUnit = MessageUnit & {
  installedAt: Date;
  /** The linked planned site's name, if linked at install. */
  siteName: string | null;
  address: string | null;
  batteryLast: number | null;
  rssiLast: number | null;
  /** Newest reading so far (the box sends before the installer taps "installed"). */
  lastReceivedAt: Date | null;
};

/** The Discord webhook body announcing a new installation. */
export function installMessage(u: InstallUnit, adminBaseUrl: string | null): { content: string; embeds: object[] } {
  const box = u.apName?.replace(/^Soundwatch-/, "") ?? u.sensorId.slice(0, 8);
  const where = u.siteName ? `at ${u.siteName}`
    : u.address ? `at ${u.address}, not linked to a site`
    : u.latitude != null ? "by GPS, not linked to a site yet"
    : "with no location yet";
  const lines = [`Installed ${athensTime(u.installedAt)}, ${where}.`];
  if (u.lastReceivedAt) {
    const facts = [u.rssiLast != null ? `signal ${Math.round(u.rssiLast)} dBm` : null, u.batteryLast != null ? `battery ${Math.round(u.batteryLast)}%` : null].filter(Boolean);
    lines.push(`Sending${facts.length ? `: ${facts.join(" · ")}` : "."}`);
  } else {
    lines.push("No reading yet. If none arrives within 30 minutes, Echo will say it is silent.");
  }
  if (needsCharge(u.batteryLast)) {
    lines.push(`⚠️ Its battery reads ${Math.round(u.batteryLast!)}%: make sure it is on mains power, or it dies the moment it is unplugged.`);
  }
  const links = messageLinks(u, adminBaseUrl);
  if (links) lines.push(links);
  const url = adminBaseUrl ? `${adminBaseUrl.replace(/\/$/, "")}/admin/units/${u.sensorId}` : undefined;
  return {
    content: "",
    embeds: [{ title: `🟢 New unit installed: ${u.title} (${box})`, description: lines.join("\n"), color: COLOR.resolved, ...(url ? { url } : {}), timestamp: u.installedAt.toISOString() }],
  };
}

/** The Discord webhook body for an incident opening or closing. */
export function discordMessage(
  inc: { kind: IncidentKind; cause: string | null; openedAt: Date; closedAt: Date | null; evidence: Record<string, unknown> | null },
  unit: MessageUnit,
  adminBaseUrl: string | null,
): { content: string; embeds: object[] } {
  const box = unit.apName?.replace(/^Soundwatch-/, "") ?? unit.sensorId.slice(0, 8);
  const resolved = inc.closedAt != null;
  const ev = inc.evidence ?? {};
  const lines: string[] = [];
  if (resolved) {
    lines.push(RESOLVED_LINE[inc.kind](duration(inc.closedAt!.getTime() - outageStart(inc).getTime())));
  } else {
    if (inc.kind === "silent") lines.push(SILENT_CAUSE_TEXT[(inc.cause as SilentCause) ?? "unknown"]);
    lines.push(`**What to do:** ${whatToDo(inc)}`);
    const facts: string[] = [];
    if (inc.kind === "silent") {
      if (typeof ev.lastReceivedAt === "string") facts.push(`Last heard ${athensTime(new Date(ev.lastReceivedAt))}`);
      if (typeof ev.batteryLast === "number") facts.push(`battery ${Math.round(ev.batteryLast)}%`);
      if (typeof ev.routerRestarts24h === "number" && ev.routerRestarts24h > 0) facts.push(`the router restarted ${ev.routerRestarts24h}× in the day before`);
    } else if (typeof ev.count === "number") {
      facts.push(`${ev.count} times in the last 24 h`);
    } else if (typeof ev.rssiAvg1h === "number") {
      facts.push(`${ev.rssiAvg1h} dBm average over the last hour`);
    }
    if (facts.length) lines.push(facts.join(" · "));
    if (unit.latestNote) lines.push(`📝 *${athensDay(unit.latestNote.createdAt)}: ${unit.latestNote.body.slice(0, 200)}*`);
  }
  const links = messageLinks(unit, adminBaseUrl);
  if (links) lines.push(links);

  const title = resolved
    ? `✅ ${unit.title} (${box}) ${inc.kind === "silent" ? "is back" : "— resolved"}`
    : `${inc.kind === "silent" ? "🔴" : "🟠"} ${unit.title} (${box}) ${KIND_TITLE[inc.kind]}`;
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
