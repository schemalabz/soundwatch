// Serialize a SimReading into the stock SmartCitizen wire dialect:
//   {t:<iso8601>,<numeric-id>:<value>,...}
// Unquoted keys/values, comma-separated, packed arrays dash-joined.
// This is exactly what mqtt-ingester/parser.ts parses; payload.test.ts
// round-trips it through the real parser to prove that.

import type { SimReading } from "./model";

// The device's MQTT buffer is 512 bytes; a payload that outgrows it would be
// truncated to garbage on real hardware, so the simulator refuses to build one.
export const NETBUFF_SIZE = 512;

/** Format like the firmware: seconds precision, Z suffix, no milliseconds. */
function isoSeconds(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function buildPayload(r: SimReading): string {
  const parts: string[] = [`t:${isoSeconds(r.recordedAt)}`];

  // Stock environment ids (53/noise deliberately never sent — Flavor >= 1
  // firmware disables it; noise travels as accumulators instead).
  parts.push(`55:${r.temperature}`);
  parts.push(`56:${r.humidity}`);
  parts.push(`58:${r.pressureKpa}`); // kPa on the wire; ingester converts to Pa
  parts.push(`10:${r.battery}`);
  parts.push(`220:${r.rssi}`);
  parts.push(`221:${r.sdCard}`);
  parts.push(`214:${r.uvA}`);
  parts.push(`215:${r.uvB}`);
  parts.push(`216:${r.uvC}`);
  if (r.lightLux != null) parts.push(`14:${r.lightLux}`);
  if (r.pm) {
    parts.push(`193:${r.pm.pm1}`);
    parts.push(`194:${r.pm.pm25}`);
    parts.push(`195:${r.pm.pm4}`);
    parts.push(`196:${r.pm.pm10}`);
    parts.push(`197:${r.pm.pn05}`);
    parts.push(`198:${r.pm.pn10}`);
    parts.push(`199:${r.pm.pn25}`);
    parts.push(`200:${r.pm.pn40}`);
    parts.push(`201:${r.pm.pn100}`);
    parts.push(`202:${r.pm.tps}`);
  }

  // Flavor 1 accumulators; payload v3 => id 238 carries milliseconds.
  parts.push(`235:3`);
  parts.push(`236:${r.energySum}`);
  parts.push(`237:${r.frameCount}`);
  parts.push(`238:${r.intervalMs}`);
  parts.push(`239:${r.maxEnergy}`);
  parts.push(`240:${r.minEnergy}`);

  // Flavor 2 + diagnostics (242/243 alternate per interval, see model.ts).
  parts.push(`241:${r.histCounts.join("-")}`);
  if (r.bandsDb10) parts.push(`242:${r.bandsDb10.join("-")}`);
  if (r.diagString) parts.push(`243:${r.diagString}`);

  const payload = `{${parts.join(",")}}`;
  if (payload.length > NETBUFF_SIZE) {
    throw new Error(`Simulated payload exceeds NETBUFF (${payload.length} > ${NETBUFF_SIZE}B): ${payload.slice(0, 80)}...`);
  }
  return payload;
}
