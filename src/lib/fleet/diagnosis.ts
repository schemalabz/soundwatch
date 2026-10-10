// The unit page's "likely cause" card: the evidence behind silentCause(),
// spelled out the way it was argued on the Sep 30 call — each claim with the
// number that supports it. Pure, tested.
import { SILENT_CAUSE_TEXT, needsCharge, type SilentCause } from "./status";

export interface DiagnosisInput {
  cause: SilentCause;
  batteryLast: number | null;
  batteryMin1h: number | null;
  batteryMax1h: number | null;
  /** Mean signal over the last hour the unit was heard; null = never joined wifi. */
  rssiLastHour: number | null;
  /** Max publish failures counter over that hour. */
  publishFails1h: number | null;
  /** Connects from a new public IP in the 24 h before the unit went silent. */
  routerRestartsBefore: { at: string; ip: string }[];
  /** The broker's last word on the unit. */
  lastDisconnect: { at: string; reason: string } | null;
  /** Unscheduled restarts in the 24 h before silence. */
  unscheduledBootsBefore: number;
  /** When the unit was last heard. */
  lastReceivedAt: string;
  /** The broker log's first connection record (any unit); null = none at all. */
  brokerRecordsFrom: string | null;
}

export interface Evidence {
  claim: string;
  detail: string;
  /** true = supports the stated cause; false = points elsewhere. */
  supports: boolean;
}

const hm = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

const day = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", day: "numeric", month: "short" }).format(new Date(iso));

export function diagnose(d: DiagnosisInput): { headline: string; evidence: Evidence[] } {
  const evidence: Evidence[] = [];

  if (d.cause === "on_battery" && d.batteryLast != null) {
    evidence.push({
      claim: "The battery was draining",
      detail: `It fell from ${Math.round(d.batteryMax1h ?? d.batteryLast)}% to ${Math.round(d.batteryLast)}% in its last hour — running without mains.`,
      supports: true,
    });
  } else if (d.batteryLast != null && !needsCharge(d.batteryLast)) {
    const steady = d.batteryMin1h != null && d.batteryMax1h != null && d.batteryMax1h - d.batteryMin1h < 3;
    evidence.push({
      claim: "The sensor had power",
      detail: `Battery ${Math.round(d.batteryLast)}% at its last reading${steady ? ", steady" : ""}. Unplugged, it would have kept uploading on battery and drained.`,
      supports: d.cause === "network_lost_powered",
    });
  } else {
    evidence.push({
      claim: "Battery tells us nothing",
      detail: d.batteryLast == null
        ? "No battery reading."
        : `It reads ${Math.round(d.batteryLast)}% — too low to tell a power cut from a network outage.`,
      supports: false,
    });
  }

  if (d.routerRestartsBefore.length > 0) {
    const times = d.routerRestartsBefore.map((r) => hm(r.at)).join(" and ");
    evidence.push({
      claim: d.routerRestartsBefore.length === 1 ? "The router restarted" : `The router restarted ${d.routerRestartsBefore.length} times`,
      detail: `The unit came back from a new public IP at ${times} before going silent.`,
      supports: true,
    });
  }

  if (d.rssiLastHour == null) {
    evidence.push({ claim: "It was not on wifi", detail: "No signal reading in its last hour — the unit had not joined a network.", supports: false });
  } else {
    const fails = d.publishFails1h ?? 0;
    evidence.push({
      claim: fails === 0 && d.rssiLastHour >= -72 ? "Wifi was healthy to the end" : "Wifi was struggling",
      detail: `Signal ${Math.round(d.rssiLastHour)} dBm, ${fails === 0 ? "zero" : fails} failed uploads in its last hour.`,
      supports: fails === 0 && d.rssiLastHour >= -72,
    });
  }

  if (d.lastDisconnect) {
    const timeout = /timeout/i.test(d.lastDisconnect.reason);
    evidence.push({
      claim: timeout ? "The network vanished, not the unit" : `The broker says: ${d.lastDisconnect.reason}`,
      detail: timeout
        ? `The broker saw the connection time out at ${hm(d.lastDisconnect.at)}; the unit never said goodbye.`
        : `At ${hm(d.lastDisconnect.at)}.`,
      supports: timeout,
    });
  }

  if (!d.lastDisconnect && d.routerRestartsBefore.length === 0) {
    const dayBefore = new Date(d.lastReceivedAt).getTime() - 24 * 3600_000;
    if (d.brokerRecordsFrom == null || new Date(d.brokerRecordsFrom).getTime() > dayBefore) {
      evidence.push({
        claim: "No connection records for that day",
        detail: d.brokerRecordsFrom == null
          ? "There are no broker records at all, so router restarts cannot be checked."
          : `The broker’s log starts ${day(d.brokerRecordsFrom)}, after the day before it went silent, so router restarts cannot be checked.`,
        supports: false,
      });
    }
  }

  if (d.unscheduledBootsBefore > 0) {
    evidence.push({
      claim: `${d.unscheduledBootsBefore} unscheduled ${d.unscheduledBootsBefore === 1 ? "restart" : "restarts"}`,
      detail: "Outside the daily scheduled restart, in the day before it went silent.",
      supports: d.routerRestartsBefore.length > 0,
    });
  }

  return { headline: SILENT_CAUSE_TEXT[d.cause], evidence };
}

