import { PrismaClient, Prisma } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { classifiedEvents } from "./eventsSql";

// Runs the real fragment over fixture CTEs that shadow `sensors` and
// `device_events`: read-only, any Postgres. Opt-in (CI has no database).
const run = !!process.env.HEALTH_SQL_DB;

describe.runIf(run)("classifiedEvents, executed", () => {
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());
  it("ignores the installation, counts the store", async () => {
    // D084, Oct 3: office IP, store IP 46 s before installed_at, a boot at
    // install, then a real router restart at 23:11 and a scheduled boot.
    const rows = await prisma.$queryRaw<{ at: Date; kind: string; new_ip: boolean; router_restart: boolean; unscheduled: boolean }[]>(Prisma.sql`
      WITH sensors AS (SELECT 'd084'::text AS id, '2026-10-03T10:04:23Z'::timestamptz AS installed_at),
      device_events AS (SELECT * FROM (VALUES
        ('d084', '2026-10-01T07:00:00Z'::timestamptz, 'connect', '{"ip":"46.190.81.76"}'::jsonb),
        ('d084', '2026-10-03T10:03:37Z', 'connect', '{"ip":"91.140.94.196"}'),
        ('d084', '2026-10-03T10:03:42Z', 'boot', '{"scheduled":false}'),
        ('d084', '2026-10-03T23:11:57Z', 'connect', '{"ip":"109.242.237.215"}'),
        ('d084', '2026-10-04T03:00:35Z', 'boot', '{"scheduled":true}'),
        ('d084', '2026-10-04T15:00:00Z', 'boot', '{"scheduled":false}')
      ) v(sensor_id, at, kind, detail))
      SELECT at, kind, new_ip, router_restart, unscheduled FROM (${classifiedEvents()}) ev ORDER BY at`);
    expect(rows.map((r) => [r.kind, r.new_ip, r.router_restart, r.unscheduled])).toEqual([
      ["connect", false, false, false], // first ever
      ["connect", true, false, false],  // office → store: installation
      ["boot", false, false, false],    // power cycle while mounting
      ["connect", true, true, false],   // a real router restart
      ["boot", false, false, false],    // scheduled
      ["boot", false, false, true],     // a real unscheduled restart
    ]);
  });
});
