// Print the fleet as the admin API sees it — for checking the status rules
// against a database without a browser. npx tsx scripts/admin-fleet-probe.ts
import { PrismaClient } from "@prisma/client";
import { loadFleet } from "../src/lib/server/fleet";

const prisma = new PrismaClient();
const t0 = Date.now();
loadFleet(prisma, process.env.AT ? new Date(process.env.AT) : new Date()).then((f) => {
  const ms = Date.now() - t0;
  for (const u of f.units) {
    const strip = u.cells.map((c) => ({ live: "█", offline: "▒", silent: "·", none: " " })[c]).join("");
    console.log(
      `${u.status.padEnd(14)} ${(u.apName ?? u.deviceId).padEnd(16)} ${strip} ` +
      `${u.completeness7d == null ? "  —" : String(Math.round(u.completeness7d * 100)).padStart(3) + "%"} ` +
      `rssi ${u.rssiAvg24h ?? "—"} batt ${u.batteryLast ?? "—"} ${u.network.provider ?? ""}${u.network.staticIp ? " static" : ""} ips7d=${u.network.ips7d} rr7d=${u.network.routerRestarts7d} ub7d=${u.unscheduledBoots7d} ` +
      `${u.silentCause ?? ""} ${u.watchReasons.join("; ")}`
    );
  }
  console.log(`${f.units.length} units in ${ms} ms`);
}).finally(() => prisma.$disconnect());
