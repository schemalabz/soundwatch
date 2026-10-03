// The incident evaluator: once a minute, gather each installed unit's
// numbers, let src/lib/fleet/alerts.ts decide what opens and closes, and
// deliver to Discord.
//
// Delivery is de-duplicated in the database (notified_at, resolved_notified_at),
// so a restart never re-sends. Without DISCORD_WEBHOOK_URL it is a dry run: the
// message is logged and the incident marked delivered-as-dry-run — so plugging
// the webhook in later does not replay the backlog.
import type { PrismaClient } from "@prisma/client";
import { discordMessage, evaluate, type AlertUnit, type IncidentKind } from "../src/lib/fleet/alerts";

interface UnitRow {
  sensor_id: string;
  title: string;
  ap_name: string | null;
  last_at: Date | null;
  battery: number | null;
  bmin: number | null;
  bmax: number | null;
  rssi_avg: number | null;
  boots_24h: bigint;
  router_24h: bigint;
}

async function gather(prisma: PrismaClient, now: Date): Promise<AlertUnit[]> {
  const rows = await prisma.$queryRaw<UnitRow[]>`
    WITH c AS (
      SELECT sensor_id, at, detail->>'ip' AS ip,
             lag(detail->>'ip') OVER (PARTITION BY sensor_id ORDER BY at) AS prev_ip
      FROM device_events WHERE kind = 'connect' AND at > ${now}::timestamptz - INTERVAL '8 days'
    )
    SELECT s.id AS sensor_id,
           coalesce(p.name, s.name, s.address, 'Box ' || replace(s.ap_name, 'Soundwatch-', ''), s.device_id) AS title,
           s.ap_name, l.received_at AS last_at, l.battery, h.bmin, h.bmax, h.rssi_avg,
           (SELECT count(*) FROM device_events e WHERE e.sensor_id = s.id AND e.kind = 'boot'
              AND (e.detail->>'scheduled')::boolean IS FALSE AND e.at > ${now}::timestamptz - INTERVAL '24 hours')::bigint AS boots_24h,
           (SELECT count(*) FROM c WHERE c.sensor_id = s.id AND c.prev_ip IS NOT NULL AND c.ip <> c.prev_ip
              AND c.at > ${now}::timestamptz - INTERVAL '24 hours')::bigint AS router_24h
    FROM sensors s
    LEFT JOIN planned_locations p ON p.id = s.planned_location_id
    LEFT JOIN LATERAL (
      SELECT received_at, battery FROM readings r WHERE r.sensor_id = s.id ORDER BY received_at DESC LIMIT 1
    ) l ON true
    LEFT JOIN LATERAL (
      SELECT min(battery) AS bmin, max(battery) AS bmax, avg(rssi) AS rssi_avg FROM readings r
      WHERE r.sensor_id = s.id AND r.received_at > l.received_at - INTERVAL '1 hour'
    ) h ON l.received_at IS NOT NULL
    WHERE s.installed_at IS NOT NULL AND s.retired_at IS NULL AND s.is_active AND NOT s.is_experimental`;
  return rows.map((r) => ({
    sensorId: r.sensor_id,
    title: r.title,
    apName: r.ap_name,
    lastReceivedAt: r.last_at,
    batteryLast: r.battery,
    batteryMin1h: r.bmin,
    batteryMax1h: r.bmax,
    rssiAvg1h: r.rssi_avg,
    unscheduledBoots24h: Number(r.boots_24h),
    routerRestarts24h: Number(r.router_24h),
  }));
}

async function deliver(body: object): Promise<"discord" | "dry-run" | "failed"> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) {
    console.log(`[alerts] dry run (DISCORD_WEBHOOK_URL unset): ${JSON.stringify(body)}`);
    return "dry-run";
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[alerts] Discord answered ${res.status}`);
      return "failed";
    }
    return "discord";
  } catch (err) {
    console.error("[alerts] Discord delivery failed:", err);
    return "failed";
  }
}

export async function runAlertsOnce(prisma: PrismaClient, now = new Date()): Promise<void> {
  const units = await gather(prisma, now);
  const open = await prisma.incident.findMany({ where: { closedAt: null }, select: { id: true, sensorId: true, kind: true } });
  const decision = evaluate(units, open.map((i) => ({ ...i, kind: i.kind as IncidentKind })), now);

  for (const o of decision.open) {
    await prisma.incident.create({
      data: { sensorId: o.sensorId, kind: o.kind, openedAt: o.since, cause: o.cause, evidence: o.evidence as object },
    });
    console.log(`[alerts] opened ${o.kind} for ${o.sensorId}${o.cause ? ` (${o.cause})` : ""}`);
  }
  if (decision.close.length) {
    await prisma.incident.updateMany({ where: { id: { in: decision.close.map((x) => BigInt(x)) } }, data: { closedAt: now } });
    console.log(`[alerts] closed ${decision.close.length}`);
  }

  // Deliver what has not been delivered. Closed before it was ever announced
  // (opened and resolved inside one tick) = nothing worth saying.
  const pending = await prisma.incident.findMany({
    where: { OR: [{ notifiedAt: null }, { closedAt: { not: null }, resolvedNotifiedAt: null }] },
    include: { sensor: { select: { apName: true, name: true, address: true, deviceId: true, plannedLocation: { select: { name: true } } } } },
    orderBy: { openedAt: "asc" },
  });
  const base = process.env.ADMIN_BASE_URL || null;
  for (const inc of pending) {
    const unit = {
      title: inc.sensor.plannedLocation?.name ?? inc.sensor.name ?? inc.sensor.address ??
        (inc.sensor.apName ? `Box ${inc.sensor.apName.replace(/^Soundwatch-/, "")}` : inc.sensor.deviceId),
      apName: inc.sensor.apName,
      sensorId: inc.sensorId,
    };
    const evidence = (inc.evidence ?? {}) as Record<string, unknown>;
    if (inc.notifiedAt == null && inc.closedAt != null) {
      await prisma.incident.update({ where: { id: inc.id }, data: { notifiedAt: now, resolvedNotifiedAt: now } });
      continue;
    }
    const resolving = inc.notifiedAt != null;
    const result = await deliver(discordMessage(
      { kind: inc.kind as IncidentKind, cause: inc.cause, openedAt: inc.openedAt, closedAt: resolving ? inc.closedAt : null, evidence },
      unit, base,
    ));
    if (result === "failed") continue; // retried next tick
    await prisma.incident.update({
      where: { id: inc.id },
      data: resolving
        ? { resolvedNotifiedAt: now }
        : { notifiedAt: now, evidence: { ...evidence, delivery: result } },
    });
  }
}

/** Evaluate every `intervalMs`; the first pass waits one interval so the
 *  broker-log tail and live readings have caught up after a restart. */
export function startAlerts(prisma: PrismaClient, intervalMs = 60_000): () => void {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await runAlertsOnce(prisma);
    } catch (err) {
      console.error("[alerts] evaluation failed:", err);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}
