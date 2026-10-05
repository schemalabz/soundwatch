// The fleet, as the admin sees it: every unit with its status, the reasons
// for it, a 30-day strip and the health numbers. A handful of grouped reads,
// none of which scans raw readings beyond an index probe per sensor:
//
//   readings_hour_health  strips, completeness, signal       (rollup)
//   readings_hour_bins    7-day level                         (rollup)
//   readings              newest row + last hour per sensor   (LATERAL on the received_at index)
//   device_events         restarts, connections, router restarts
import type { PrismaClient } from "@prisma/client";
import type { FleetResponse, FleetUnit } from "@/lib/api/admin";
import { cellState, fleetStatus, silentCause, watchReasons } from "@/lib/fleet/status";
import { isStaticIp, providerOf } from "@/lib/fleet/network";
import { classifiedEvents } from "@/lib/fleet/eventsSql";

const CELL_S = 12 * 3600;
const WINDOW_DAYS = 30;

interface LastRow { sensor_id: string; last_at: Date | null; battery: number | null; bmin: number | null; bmax: number | null; release: string | null }
interface CellRow { sensor_id: string; c: bigint; n: bigint; on_time: bigint }
interface HealthRow { sensor_id: string; rssi_avg_24h: number | null; rssi_min_7d: number | null; hours_7d: bigint }
interface LevelRow { sensor_id: string; laeq: number | null }
interface NoteRow { sensor_id: string; id: bigint; body: string; created_at: Date }
interface EventRow { sensor_id: string; unsched_24h: bigint; unsched_7d: bigint; router_24h: bigint; router_7d: bigint; ips_7d: bigint; ip: string | null; ptr: string | null; network: string | null }

export async function loadFleet(prisma: PrismaClient, now = new Date()): Promise<FleetResponse> {
  const sensors = await prisma.sensor.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      plannedLocation: { select: { id: true, name: true } },
      supersededBy: { select: { id: true, deviceId: true } },
    },
  });

  const [last, cells, health, levels, events, notes] = await Promise.all([
    // Newest arrival, plus the battery over the hour before it: what a silent
    // unit's last hour says about power (see silentCause).
    prisma.$queryRaw<LastRow[]>`
      SELECT s.id AS sensor_id, l.received_at AS last_at, l.battery, h.bmin, h.bmax, l.soundwatch_release AS release
      FROM sensors s
      LEFT JOIN LATERAL (
        SELECT received_at, battery, soundwatch_release FROM readings r
        WHERE r.sensor_id = s.id ORDER BY received_at DESC LIMIT 1
      ) l ON true
      LEFT JOIN LATERAL (
        SELECT min(battery) AS bmin, max(battery) AS bmax FROM (
          SELECT battery FROM readings r
          WHERE r.sensor_id = s.id AND r.received_at > l.received_at - INTERVAL '1 hour'
          ORDER BY received_at DESC LIMIT 150
        ) x
      ) h ON l.received_at IS NOT NULL`,
    prisma.$queryRaw<CellRow[]>`
      SELECT sensor_id, floor(extract(epoch FROM bucket) / ${CELL_S})::bigint AS c,
             sum(n)::bigint AS n, sum(n_on_time)::bigint AS on_time
      FROM readings_hour_health
      WHERE bucket >= ${now}::timestamptz - make_interval(days => ${WINDOW_DAYS}::int)
      GROUP BY 1, 2`,
    prisma.$queryRaw<HealthRow[]>`
      SELECT h.sensor_id,
             sum(h.rssi_sum) FILTER (WHERE h.bucket > ${now}::timestamptz - INTERVAL '24 hours')
               / nullif(sum(h.rssi_n) FILTER (WHERE h.bucket > ${now}::timestamptz - INTERVAL '24 hours'), 0) AS rssi_avg_24h,
             min(h.rssi_min) AS rssi_min_7d,
             count(*) FILTER (WHERE h.n > 0 AND h.bucket >= greatest(${now}::timestamptz - INTERVAL '7 days', date_trunc('hour', s.installed_at)))::bigint AS hours_7d
      FROM readings_hour_health h JOIN sensors s ON s.id = h.sensor_id
      WHERE h.bucket > ${now}::timestamptz - INTERVAL '7 days'
      GROUP BY 1`,
    prisma.$queryRaw<LevelRow[]>`
      SELECT sensor_id, 10 * log(sum(energy) / nullif(sum(n), 0)) AS laeq
      FROM readings_hour_bins
      WHERE bucket > ${now}::timestamptz - INTERVAL '7 days'
      GROUP BY 1`,
    // Router restarts and unscheduled restarts, as src/lib/fleet/eventsSql.ts
    // classifies them (never during the installation itself).
    prisma.$queryRaw<EventRow[]>`
      WITH ev AS (SELECT * FROM (${classifiedEvents()}) x WHERE x.at <= ${now}::timestamptz),
      latest AS (
        SELECT DISTINCT ON (sensor_id) sensor_id, ip FROM ev WHERE kind = 'connect' ORDER BY sensor_id, at DESC
      )
      SELECT s.id AS sensor_id,
        (SELECT count(*) FROM ev WHERE ev.sensor_id = s.id AND ev.unscheduled
           AND ev.at > ${now}::timestamptz - INTERVAL '24 hours')::bigint AS unsched_24h,
        (SELECT count(*) FROM ev WHERE ev.sensor_id = s.id AND ev.unscheduled
           AND ev.at > ${now}::timestamptz - INTERVAL '7 days')::bigint AS unsched_7d,
        (SELECT count(*) FROM ev WHERE ev.sensor_id = s.id AND ev.router_restart
           AND ev.at > ${now}::timestamptz - INTERVAL '24 hours')::bigint AS router_24h,
        (SELECT count(*) FROM ev WHERE ev.sensor_id = s.id AND ev.router_restart
           AND ev.at > ${now}::timestamptz - INTERVAL '7 days')::bigint AS router_7d,
        (SELECT count(DISTINCT ev.ip) FROM ev WHERE ev.sensor_id = s.id AND ev.kind = 'connect'
           AND ev.at > ${now}::timestamptz - INTERVAL '7 days')::bigint AS ips_7d,
        latest.ip, i.ptr, i.network
      FROM sensors s
      LEFT JOIN latest ON latest.sensor_id = s.id
      LEFT JOIN ip_info i ON i.ip = latest.ip`,
    // Notes are written by people in the present: not bounded by `now`.
    prisma.$queryRaw<NoteRow[]>`
      SELECT DISTINCT ON (sensor_id) sensor_id, id, body, created_at
      FROM unit_notes ORDER BY sensor_id, created_at DESC`,
  ]);

  const by = <T extends { sensor_id: string }>(rows: T[]) => new Map(rows.map((r) => [r.sensor_id, r]));
  const lastBy = by(last), healthBy = by(health), levelBy = by(levels), eventsBy = by(events), noteBy = by(notes);
  const cellsBy = new Map<string, Map<number, { n: number; onTime: number }>>();
  for (const r of cells) {
    let m = cellsBy.get(r.sensor_id);
    if (!m) cellsBy.set(r.sensor_id, (m = new Map()));
    m.set(Number(r.c), { n: Number(r.n), onTime: Number(r.on_time) });
  }

  const nowCell = Math.floor(now.getTime() / 1000 / CELL_S);
  const firstCell = nowCell - (WINDOW_DAYS * 86400) / CELL_S + 1;

  const units: FleetUnit[] = sensors.map((s) => {
    const l = lastBy.get(s.id);
    const h = healthBy.get(s.id);
    const ev = eventsBy.get(s.id);
    const lastReceivedAt = l?.last_at ?? null;
    const last24h = {
      rssiAvg: h?.rssi_avg_24h ?? null,
      unscheduledBoots: Number(ev?.unsched_24h ?? 0),
      routerRestarts: Number(ev?.router_24h ?? 0),
    };
    const status = fleetStatus(
      { retiredAt: s.retiredAt, isActive: s.isActive, isExperimental: s.isExperimental, provisionedAt: s.provisionedAt,
        handedOverAt: s.handedOverAt, installedAt: s.installedAt, lastReceivedAt },
      last24h, now,
    );

    // A cell is "expected" once the unit is installed (or, for bench units,
    // once it exists): empty expected cells are outages, the rest are blank.
    const since = s.installedAt ?? (s.isExperimental ? s.createdAt : null);
    const m = cellsBy.get(s.id);
    const cellsOut = Array.from({ length: nowCell - firstCell + 1 }, (_, i) => {
      const c = firstCell + i;
      const v = m?.get(c);
      const expected = since != null && (c + 1) * CELL_S * 1000 > since.getTime() && !s.retiredAt && s.isActive;
      return cellState(v?.n ?? 0, v?.onTime ?? 0, expected);
    });

    let completeness7d: number | null = null;
    if (s.installedAt) {
      const from = Math.max(now.getTime() - 7 * 86400_000, s.installedAt.getTime());
      const hours = Math.max(1, Math.ceil((now.getTime() - from) / 3600_000));
      completeness7d = Math.min(1, Number(h?.hours_7d ?? 0) / hours);
    }

    return {
      id: s.id,
      deviceId: s.deviceId,
      apName: s.apName,
      hardwareId: s.hardwareId,
      name: s.name,
      address: s.address,
      site: s.plannedLocation,
      latitude: s.latitude,
      longitude: s.longitude,
      status,
      watchReasons: status === "watch" ? watchReasons(last24h) : [],
      silentCause: status === "silent"
        ? silentCause({ batteryMin: l?.bmin ?? null, batteryMax: l?.bmax ?? null, batteryLast: l?.battery ?? null })
        : null,
      lastReceivedAt: lastReceivedAt?.toISOString() ?? null,
      provisionedAt: s.provisionedAt?.toISOString() ?? null,
      installedAt: s.installedAt?.toISOString() ?? null,
      handedOverAt: s.handedOverAt?.toISOString() ?? null,
      retiredAt: s.retiredAt?.toISOString() ?? null,
      supersededBy: s.supersededBy,
      firmware: l?.release ?? null,
      cells: cellsOut,
      completeness7d,
      rssiAvg24h: h?.rssi_avg_24h != null ? Math.round(h.rssi_avg_24h) : null,
      rssiMin7d: h?.rssi_min_7d ?? null,
      batteryLast: l?.battery ?? null,
      unscheduledBoots7d: Number(ev?.unsched_7d ?? 0),
      laeq7d: levelBy.get(s.id)?.laeq ?? null,
      network: {
        ip: ev?.ip ?? null,
        provider: providerOf(ev?.ptr ?? null, ev?.network ?? null),
        staticIp: isStaticIp(ev?.ptr ?? null),
        ips7d: Number(ev?.ips_7d ?? 0),
        routerRestarts7d: Number(ev?.router_7d ?? 0),
      },
      latestNote: (() => {
        const n = noteBy.get(s.id);
        return n ? { id: String(n.id), body: n.body, createdAt: n.created_at.toISOString() } : null;
      })(),
    };
  });

  return { generatedAt: now.toISOString(), cellHours: CELL_S / 3600, windowDays: WINDOW_DAYS, units };
}
