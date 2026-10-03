// The incident evaluator: once a minute, gather each installed unit's
// numbers, let src/lib/fleet/alerts.ts decide what opens and closes, and
// deliver to Discord.
//
// Delivery is claimed in the database (notified_at, resolved_notified_at)
// before each post, so neither a restart nor a second evaluator re-sends.
// Without DISCORD_WEBHOOK_URL it is a dry run: the message is logged and the
// incident marked delivered-as-dry-run — so plugging the webhook in later
// does not replay the backlog.
import type { PrismaClient } from "@prisma/client";
import { ALERT_SILENT_MS, discordMessage, evaluate, type AlertUnit, type IncidentKind } from "../src/lib/fleet/alerts";
import { classifiedEvents } from "../src/lib/fleet/eventsSql";

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
    WITH ev AS (${classifiedEvents()})
    SELECT s.id AS sensor_id,
           coalesce(p.name, s.name, s.address, 'Box ' || replace(s.ap_name, 'Soundwatch-', ''), s.device_id) AS title,
           s.ap_name, l.received_at AS last_at, l.battery, h.bmin, h.bmax, h.rssi_avg,
           (SELECT count(*) FROM ev WHERE ev.sensor_id = s.id AND ev.unscheduled
              AND ev.at > ref.t - INTERVAL '24 hours' AND ev.at <= ref.t)::bigint AS boots_24h,
           (SELECT count(*) FROM ev WHERE ev.sensor_id = s.id AND ev.router_restart
              AND ev.at > ref.t - INTERVAL '24 hours' AND ev.at <= ref.t)::bigint AS router_24h
    FROM sensors s
    LEFT JOIN planned_locations p ON p.id = s.planned_location_id
    LEFT JOIN LATERAL (
      SELECT received_at, battery FROM readings r WHERE r.sensor_id = s.id ORDER BY received_at DESC LIMIT 1
    ) l ON true
    LEFT JOIN LATERAL (
      SELECT min(battery) AS bmin, max(battery) AS bmax, avg(rssi) AS rssi_avg FROM readings r
      WHERE r.sensor_id = s.id AND r.received_at > l.received_at - INTERVAL '1 hour'
    ) h ON l.received_at IS NOT NULL
    -- Counts are taken over the 24 h before "now", or, for a silent unit, before
    -- its last reading: what happened before the silence is the evidence.
    CROSS JOIN LATERAL (
      SELECT CASE WHEN l.received_at < ${now}::timestamptz - make_interval(secs => ${ALERT_SILENT_MS / 1000}::double precision)
                  THEN l.received_at ELSE ${now}::timestamptz END AS t
    ) ref
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
    try {
      await prisma.incident.create({
        data: { sensorId: o.sensorId, kind: o.kind, openedAt: o.since, cause: o.cause, evidence: o.evidence as object },
      });
      console.log(`[alerts] opened ${o.kind} for ${o.sensorId}${o.cause ? ` (${o.cause})` : ""}`);
    } catch (err) {
      // incidents_one_open (migration 0020): another evaluator opened it first.
      if ((err as { code?: string })?.code !== "P2002") throw err;
    }
  }
  if (decision.close.length) {
    // open_slot back to NULL: the (unit, kind) slot is free for the next one.
    await prisma.incident.updateMany({ where: { id: { in: decision.close.map((x) => BigInt(x)) } }, data: { closedAt: now, openSlot: null } });
    console.log(`[alerts] closed ${decision.close.length}`);
  }
  if (decision.closeQuiet.length) {
    // Retired or uninstalled: closed and marked as announced, so no
    // "resolved" message claims the unit came back.
    await prisma.incident.updateMany({
      where: { id: { in: decision.closeQuiet.map((x) => BigInt(x)) } },
      data: { closedAt: now, resolvedNotifiedAt: now, openSlot: null },
    });
  }

  // Deliver what has not been delivered. Each message is CLAIMED first (a
  // conditional update): two evaluators — the ingester and
  // scripts/alerts-once.ts — never both post. At most once: a crash between
  // claim and post loses that message, which beats posting it twice.
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
    const resolving = inc.notifiedAt != null;
    const closedUnannounced = !resolving && inc.closedAt != null;
    // Opened and resolved inside one tick, never tried: nothing worth saying.
    // Tried and failed (Discord was down): it happened, so say it once, as
    // resolved — claiming notifiedAt AND resolvedNotifiedAt in one atomic
    // update, before posting. Claiming them one at a time (notifiedAt now,
    // resolvedNotifiedAt only after a successful post) left a window where a
    // second evaluator reads notifiedAt set, resolvedNotifiedAt still null,
    // concludes resolving=true, and posts "resolved" again.
    if (closedUnannounced) {
      if (evidence.deliveryFailedAt == null) {
        await prisma.incident.update({ where: { id: inc.id }, data: { notifiedAt: now, resolvedNotifiedAt: now } });
        continue;
      }
      const claim = await prisma.incident.updateMany({
        where: { id: inc.id, notifiedAt: null, resolvedNotifiedAt: null },
        data: { notifiedAt: now, resolvedNotifiedAt: now },
      });
      if (claim.count === 0) continue;
      const result = await deliver(discordMessage(
        { kind: inc.kind as IncidentKind, cause: inc.cause, openedAt: inc.openedAt, closedAt: inc.closedAt, evidence },
        unit, base,
      ));
      if (result === "failed") {
        // Give both claims back and remember the attempt; retried next tick.
        await prisma.incident.update({ where: { id: inc.id }, data: { notifiedAt: null, resolvedNotifiedAt: null, evidence: { ...evidence, deliveryFailedAt: now.toISOString() } } });
        continue;
      }
      await prisma.incident.update({ where: { id: inc.id }, data: { evidence: { ...evidence, delivery: result } } });
      continue;
    }
    const field = resolving ? "resolvedNotifiedAt" : "notifiedAt";
    const claim = await prisma.incident.updateMany({ where: { id: inc.id, [field]: null }, data: { [field]: now } });
    if (claim.count === 0) continue;
    const result = await deliver(discordMessage(
      { kind: inc.kind as IncidentKind, cause: inc.cause, openedAt: inc.openedAt, closedAt: resolving ? inc.closedAt : null, evidence },
      unit, base,
    ));
    if (result === "failed") {
      // Give the claim back and remember the attempt; retried next tick.
      await prisma.incident.update({ where: { id: inc.id }, data: { [field]: null, evidence: { ...evidence, deliveryFailedAt: now.toISOString() } } });
      continue;
    }
    if (!resolving) {
      await prisma.incident.update({ where: { id: inc.id }, data: { evidence: { ...evidence, delivery: result } } });
    }
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
