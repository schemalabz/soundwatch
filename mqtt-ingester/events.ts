// Device events: the discrete things that happen to a unit, as opposed to its
// 30-second readings.
//
//   boot        — a reading's uptime went DOWN (the ingester sees it arrive)
//   connect     — the broker accepted the unit, from a public IP
//   disconnect  — the broker dropped it, with mosquitto's reason
//
// The broker log is the ONLY record of a unit's public IP, and a unit
// reconnecting from a new IP is how a store's router restarting shows up
// (dynamic-IP DSL re-dials on every router restart). That is what told the
// Δάφνη and Γαλάτσι outages apart from power cuts on Sep 30.
import { promises as dns } from "node:dns";
import { open, stat } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import { isBoot, isScheduledBoot, ON_TIME_MS } from "../src/lib/fleet/status";

export interface BrokerEvent {
  at: Date;
  kind: "connect" | "disconnect";
  clientId: string;
  ip: string;
  reason?: string;
}

// mosquitto.conf sets log_timestamp_format %Y-%m-%dT%H:%M:%S%z; the archive
// seeded on Oct 1 was converted to it. Bare epoch seconds (mosquitto's
// default) are accepted too, so an older log imports without conversion.
const TS = String.raw`(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}|\d{10})`;
const CONNECT_RE = new RegExp(String.raw`^${TS}: New client connected from (\S+?):\d+ as (\S+) `);
const DISCONNECT_RE = new RegExp(String.raw`^${TS}: Client (\S+) \[(\S+?):\d+\] disconnected(?:: (.*?))?\.?$`);

function parseTs(raw: string): Date {
  if (/^\d{10}$/.test(raw)) return new Date(Number(raw) * 1000);
  // "+0000" → "+00:00": Date.parse wants the colon.
  return new Date(raw.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
}

/** One broker log line → an event, or null for every other kind of line. */
export function parseBrokerLine(line: string): BrokerEvent | null {
  const c = CONNECT_RE.exec(line);
  if (c) return { at: parseTs(c[1]), kind: "connect", ip: c[2], clientId: c[3] };
  const d = DISCONNECT_RE.exec(line.trimEnd());
  if (d) {
    return { at: parseTs(d[1]), kind: "disconnect", clientId: d[2], ip: d[3], reason: d[4] ?? "clean" };
  }
  return null;
}

/**
 * Store broker events for known devices. Anything else connecting to the
 * public listener (internet scanners: "nmap", "test", protocol errors) is not
 * ours and is dropped here. Idempotent: (sensor, kind, at) is unique.
 */
export async function importBrokerEvents(prisma: PrismaClient, events: BrokerEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  const ids = [...new Set(events.map((e) => e.clientId))];
  const sensors = await prisma.sensor.findMany({ where: { deviceId: { in: ids } }, select: { id: true, deviceId: true } });
  const byToken = new Map(sensors.map((s) => [s.deviceId, s.id]));
  const rows = events
    .filter((e) => byToken.has(e.clientId))
    .map((e) => ({
      sensorId: byToken.get(e.clientId)!,
      kind: e.kind,
      at: e.at,
      detail: e.kind === "connect" ? { ip: e.ip } : { ip: e.ip, reason: e.reason },
      source: "broker-log",
    }));
  if (rows.length === 0) return 0;
  const res = await prisma.deviceEvent.createMany({ data: rows, skipDuplicates: true });
  const newIps = [...new Set(rows.filter((r) => r.kind === "connect").map((r) => (r.detail as { ip: string }).ip))];
  await lookupIps(prisma, newIps);
  return res.count;
}

/**
 * Who owns each public IP: reverse DNS (e.g. adsl-214.91.140.85.tellas.gr =
 * Nova DSL) and the RIPE registry's network name. Looked up once per IP.
 * IP_LOOKUP=off skips the network calls (tests, air-gapped dev).
 */
export async function lookupIps(prisma: PrismaClient, ips: string[]): Promise<void> {
  if (ips.length === 0 || process.env.IP_LOOKUP === "off") return;
  const known = await prisma.ipInfo.findMany({ where: { ip: { in: ips } }, select: { ip: true } });
  const todo = ips.filter((ip) => !known.some((k) => k.ip === ip));
  for (const ip of todo) {
    const ptr = await dns.reverse(ip).then((n) => n[0] ?? null, () => null);
    const network = await fetch(`https://rdap.db.ripe.net/ip/${ip}`, { signal: AbortSignal.timeout(5000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { name?: string } | null) => j?.name ?? null)
      .catch(() => null);
    await prisma.ipInfo.upsert({ where: { ip }, update: { ptr, network, lookedUpAt: new Date() }, create: { ip, ptr, network } });
  }
}

/**
 * Follow the broker log file: everything on start (idempotent), then the
 * appended bytes every `intervalMs`. A file that shrank was rotated or
 * replaced — read it again from the top.
 */
export function tailBrokerLog(prisma: PrismaClient, path: string, intervalMs = 10_000): () => void {
  let offset = 0;
  let carry = "";
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const size = (await stat(path)).size;
      if (size < offset) { offset = 0; carry = ""; }
      if (size === offset) return;
      const fh = await open(path, "r");
      try {
        const buf = Buffer.alloc(size - offset);
        await fh.read(buf, 0, buf.length, offset);
        offset = size;
        const text = carry + buf.toString("utf8");
        const lines = text.split("\n");
        carry = lines.pop() ?? ""; // a line still being written
        const events = lines.map(parseBrokerLine).filter((e): e is BrokerEvent => e != null);
        const n = await importBrokerEvents(prisma, events);
        if (n > 0) console.log(`broker-log: ${n} new connection events`);
      } finally {
        await fh.close();
      }
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== "ENOENT") console.error("broker-log tail failed:", err);
    } finally {
      busy = false;
    }
  };
  void tick();
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}

/**
 * Called after a reading is stored: did this unit just restart?
 *
 * Compares against the sensor's previous ON-TIME reading only. A backlog
 * upload arrives interleaved with live rows and carries old uptimes; reading
 * it as a restart turned 8 days of Περιστέρι replay into 496 phantom reboots
 * when this was first done by hand.
 */
export async function recordBootIfAny(
  prisma: PrismaClient,
  sensorId: string,
  row: { recordedAt: Date; deviceUptimeS?: number | null; resetCause?: number | null },
  receivedAt: Date
): Promise<void> {
  const uptime = row.deviceUptimeS;
  if (uptime == null) return;
  if (Math.abs(receivedAt.getTime() - row.recordedAt.getTime()) > ON_TIME_MS) return;
  const prev = await prisma.$queryRaw<{ up: number | null }[]>`
    SELECT device_uptime_s AS up FROM readings
    WHERE sensor_id = ${sensorId}
      AND received_at < ${receivedAt}
      AND abs(extract(epoch FROM received_at - recorded_at)) <= ${ON_TIME_MS / 1000}
    ORDER BY received_at DESC LIMIT 1`;
  if (!isBoot(prev[0]?.up, uptime)) return;
  // Server clock minus uptime: the device clock drifts, the uptime counter does not.
  const at = new Date(receivedAt.getTime() - uptime * 1000);
  await prisma.deviceEvent.createMany({
    data: [{
      sensorId,
      kind: "boot",
      at,
      detail: { uptimeBefore: prev[0]!.up, resetCause: row.resetCause ?? null, scheduled: isScheduledBoot(at) },
      source: "ingester",
    }],
    skipDuplicates: true,
  });
}
