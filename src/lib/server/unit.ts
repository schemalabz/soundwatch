// One unit, in full: the fleet row plus what its page draws — 7 days of
// hourly health, 14 days of events, identity and settings, and for a silent
// unit the evidence behind its diagnosis.
import type { PrismaClient } from "@prisma/client";
import type { UnitDetailResponse, UnitEvent, UnitHour } from "@/lib/api/admin";
import { diagnose } from "@/lib/fleet/diagnosis";
import { isStaticIp, providerOf } from "@/lib/fleet/network";
import { loadFleet } from "./fleet";

interface HourRow { bucket: Date; n: bigint; n_on_time: bigint; rssi_sum: number | null; rssi_n: bigint; battery_min: number | null; battery_max: number | null }
interface EventRow { at: Date; kind: string; detail: Record<string, unknown> | null }
interface LastHourRow { rssi_avg: number | null; fails: number | null; bmin: number | null; bmax: number | null }
interface LastRow { received_at: Date; battery: number | null; rssi: number | null; device_uptime_s: number | null; laeq: number | null; sam_git_hash: string | null; esp_git_hash: string | null }

export async function loadUnit(prisma: PrismaClient, id: string, now: Date): Promise<UnitDetailResponse | null> {
  const sensor = await prisma.sensor.findUnique({
    where: { id },
    include: { supersedes: { select: { id: true, deviceId: true, retiredAt: true } } },
  });
  if (!sensor) return null;

  const [fleet, hours, events, last] = await Promise.all([
    loadFleet(prisma, now),
    prisma.$queryRaw<HourRow[]>`
      SELECT bucket, n, n_on_time, rssi_sum, rssi_n, battery_min, battery_max
      FROM readings_hour_health
      WHERE sensor_id = ${id} AND bucket > ${now}::timestamptz - INTERVAL '7 days' AND bucket <= ${now}::timestamptz
      ORDER BY bucket`,
    prisma.$queryRaw<EventRow[]>`
      SELECT at, kind, detail FROM device_events
      WHERE sensor_id = ${id} AND at > ${now}::timestamptz - INTERVAL '14 days' AND at <= ${now}::timestamptz
      ORDER BY at DESC LIMIT 300`,
    prisma.$queryRaw<LastRow[]>`
      SELECT received_at, battery, rssi, device_uptime_s, laeq, sam_git_hash, esp_git_hash FROM readings
      WHERE sensor_id = ${id} AND received_at <= ${now}::timestamptz
      ORDER BY received_at DESC LIMIT 1`,
  ]);
  const unit = fleet.units.find((u) => u.id === id)!;

  // Mark connects from a new public IP (router restarts): walk oldest → newest.
  const asc = [...events].reverse();
  let prevIp: string | null = null;
  const out: UnitEvent[] = asc.map((e): UnitEvent => {
    const d = e.detail ?? {};
    if (e.kind === "connect") {
      const ip = String(d.ip ?? "");
      const ev: UnitEvent = { at: e.at.toISOString(), kind: "connect", ip, newIp: prevIp != null && ip !== prevIp };
      prevIp = ip;
      return ev;
    }
    if (e.kind === "disconnect") return { at: e.at.toISOString(), kind: "disconnect" as const, ip: String(d.ip ?? ""), reason: String(d.reason ?? "") };
    return {
      at: e.at.toISOString(), kind: "boot" as const,
      scheduled: Boolean(d.scheduled), uptimeBefore: Number(d.uptimeBefore ?? 0),
      resetCause: d.resetCause == null ? null : Number(d.resetCause),
    };
  }).reverse();

  const ips = [...new Set(out.filter((e) => e.ip).map((e) => e.ip!))];
  const infos = ips.length ? await prisma.ipInfo.findMany({ where: { ip: { in: ips } } }) : [];
  const ipInfo = Object.fromEntries(infos.map((i) => [i.ip, { provider: providerOf(i.ptr, i.network), ptr: i.ptr, staticIp: isStaticIp(i.ptr) }]));

  let diagnosis: UnitDetailResponse["diagnosis"] = null;
  const lastRow = last[0];
  if (unit.status === "silent" && lastRow) {
    const lastAt = lastRow.received_at;
    const [lh] = await prisma.$queryRaw<LastHourRow[]>`
      SELECT avg(rssi) AS rssi_avg, max(publish_fails) AS fails, min(battery) AS bmin, max(battery) AS bmax
      FROM readings
      WHERE sensor_id = ${id} AND received_at > ${lastAt}::timestamptz - INTERVAL '1 hour' AND received_at <= ${lastAt}::timestamptz`;
    const dayBefore = (e: UnitEvent) => {
      const t = new Date(e.at).getTime();
      return t <= lastAt.getTime() + 10 * 60_000 && t > lastAt.getTime() - 24 * 3600_000;
    };
    const lastDisc = out.find((e) => e.kind === "disconnect" && new Date(e.at).getTime() >= lastAt.getTime() - 60_000);
    diagnosis = diagnose({
      cause: unit.silentCause ?? "unknown",
      batteryLast: lastRow.battery,
      batteryMin1h: lh?.bmin ?? null,
      batteryMax1h: lh?.bmax ?? null,
      rssiLastHour: lh?.rssi_avg ?? null,
      publishFails1h: lh?.fails ?? null,
      routerRestartsBefore: out.filter((e) => e.kind === "connect" && e.newIp && dayBefore(e)).reverse().map((e) => ({ at: e.at, ip: e.ip! })),
      lastDisconnect: lastDisc ? { at: lastDisc.at, reason: lastDisc.reason ?? "" } : null,
      unscheduledBootsBefore: out.filter((e) => e.kind === "boot" && !e.scheduled && dayBefore(e)).length,
    });
  }

  const hoursOut: UnitHour[] = hours.map((h) => ({
    t: h.bucket.toISOString(),
    n: Number(h.n),
    onTime: Number(h.n_on_time),
    rssiAvg: h.rssi_sum != null && Number(h.rssi_n) > 0 ? h.rssi_sum / Number(h.rssi_n) : null,
    batteryMin: h.battery_min,
    batteryMax: h.battery_max,
  }));

  return {
    generatedAt: now.toISOString(),
    unit,
    identity: {
      hardwareId: sensor.hardwareId,
      readingIntervalS: sensor.readingIntervalS,
      targetFirmwareVersion: sensor.targetFirmwareVersion,
      firmwareVersion: sensor.firmwareVersion,
      samGitHash: lastRow?.sam_git_hash ?? null,
      espGitHash: lastRow?.esp_git_hash ?? null,
      createdAt: sensor.createdAt.toISOString(),
      isActive: sensor.isActive,
      isExperimental: sensor.isExperimental,
      shareKey: sensor.shareKey,
      previousTokens: sensor.supersedes.map((p) => ({ id: p.id, deviceId: p.deviceId, retiredAt: p.retiredAt?.toISOString() ?? null })),
    },
    hours: hoursOut,
    events: out,
    ipInfo,
    lastReading: lastRow
      ? { receivedAt: lastRow.received_at.toISOString(), battery: lastRow.battery, rssi: lastRow.rssi, uptimeS: lastRow.device_uptime_s, laeq: lastRow.laeq }
      : null,
    diagnosis,
  };
}
