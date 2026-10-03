// The two event rules the fleet counts, written once so the fleet page, the
// unit page and the alert evaluator cannot disagree:
//   router restart       — a connect from a different public IP than the
//                          unit's previous connect (dynamic DSL re-dials)
//   unscheduled restart  — a boot outside the daily scheduled window
// Neither counts until the unit is in service: installed, plus
// INSTALL_GRACE_MS. Shipped into the ingester image with the rest of
// src/lib/fleet.
import { Prisma } from "@prisma/client";
import { INSTALL_GRACE_MS } from "./status";

export interface ClassifiedEventRow {
  sensor_id: string;
  at: Date;
  kind: "boot" | "connect" | "disconnect";
  detail: Record<string, unknown> | null;
  ip: string | null;
  /** connect: a different public IP than the previous connect (any time). */
  new_ip: boolean;
  router_restart: boolean;
  unscheduled: boolean;
}

/** A subquery over every device event: use as `FROM (${classifiedEvents()}) ev`. */
export function classifiedEvents(): Prisma.Sql {
  return Prisma.sql`
    SELECT e.sensor_id, e.at, e.kind, e.detail, e.detail->>'ip' AS ip,
           coalesce(e.prev_ip IS NOT NULL AND e.detail->>'ip' <> e.prev_ip, false) AS new_ip,
           coalesce(e.prev_ip IS NOT NULL AND e.detail->>'ip' <> e.prev_ip AND e.in_service, false) AS router_restart,
           coalesce(e.kind = 'boot' AND (e.detail->>'scheduled')::boolean IS FALSE AND e.in_service, false) AS unscheduled
    FROM (
      SELECT d.sensor_id, d.at, d.kind, d.detail,
             CASE WHEN d.kind = 'connect'
                  THEN lag(d.detail->>'ip') OVER (PARTITION BY d.sensor_id, d.kind ORDER BY d.at) END AS prev_ip,
             (s.installed_at IS NOT NULL
               AND d.at >= s.installed_at + make_interval(secs => ${INSTALL_GRACE_MS / 1000}::double precision)) AS in_service
      FROM device_events d JOIN sensors s ON s.id = d.sensor_id
    ) e`;
}
