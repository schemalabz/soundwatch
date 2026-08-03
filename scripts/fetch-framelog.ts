// SD-path v1: server-paced framelog pull.
//
// Publishes {"act":"framelog","off":N,"n":k} on the device's cmd topic and
// advances from the chunks that come back (the ingester stores them; this
// script only paces). Device bursts are bounded, so pacing lives here.
//
// Run where the broker is reachable without the device ACL — i.e. the internal
// listener. On the droplet:
//   docker run --rm --network <net> -e MQTT_BROKER_URL=mqtt://mosquitto:1884 \
//     <ingester-image> npx tsx scripts/fetch-framelog.ts bench5 [startOff] [maxBytes]
import mqtt from "mqtt";

const token = process.argv[2];
if (!token) {
  console.error("usage: fetch-framelog <token> [day] [startOffset] [maxBytes]");
  console.error("  day: YYMMDD | today | yesterday | legacy   (default today)");
  process.exit(1);
}
function resolveDay(arg: string | undefined): string {
  const d = arg ?? "today";
  if (d === "legacy") return "";
  const when = d === "today" ? new Date() : d === "yesterday" ? new Date(Date.now() - 86400_000) : null;
  if (when) {
    const p2 = (n: number) => String(n).padStart(2, "0");
    return `${p2(when.getUTCFullYear() % 100)}${p2(when.getUTCMonth() + 1)}${p2(when.getUTCDate())}`;
  }
  if (!/^\d{6}$/.test(d)) { console.error(`bad day '${d}'`); process.exit(1); }
  return d;
}
const day = resolveDay(process.argv[3]);
let nextOff = Number(process.argv[4] ?? 0);
const maxBytes = Number(process.argv[5] ?? 256 * 1024);
const startOff = nextOff;
const BURST = 16;               // chunks per request (device caps at 32)
const TICK_MS = 4000;           // re-request cadence; idempotent, so retries are safe
const MAX_IDLE_TICKS = 5;

const url = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
const client = mqtt.connect(url);
const cmdTopic = `device/sck/${token}/cmd`;
const chunkTopic = `device/sck/${token}/framelog`;

let eofSize: number | null = null;
let idleTicks = 0;
let lastOff = -1;

function request(): void {
  const req: Record<string, unknown> = { act: "framelog", off: nextOff, n: BURST };
  if (day) req.d = day;   // legacy units ignore it and serve FRAMELOG.CSV
  client.publish(cmdTopic, JSON.stringify(req));
}

client.on("connect", () => {
  console.log(`pulling framelog from ${token}${day ? ` day ${day}` : " (legacy)"} @ ${nextOff} via ${url}`);
  client.subscribe(chunkTopic, (err) => {
    if (err) { console.error("subscribe failed:", err); process.exit(1); }
    request();
  });
});

client.on("message", (_t, msg) => {
  const p = msg.toString();
  const bar = p.indexOf("|");
  if (bar <= 0) return;
  const head = p.slice(0, bar);
  const isDay = /^\d{6}$/.test(head);
  if (head === "EOF") {
    const rest = p.slice(bar + 1);
    const bar2 = rest.indexOf("|");
    if (bar2 > 0 && /^\d{6}$/.test(rest.slice(0, bar2))) {
      if (rest.slice(0, bar2) === day) eofSize = Number(rest.slice(bar2 + 1));
    } else if (!day) {
      eofSize = Number(rest);
    }
    return;
  }
  // Only advance on chunks from the namespace we asked for.
  if (isDay) {
    if (head !== day) return;
    const rest = p.slice(bar + 1);
    const bar2 = rest.indexOf("|");
    if (bar2 <= 0) return;
    const off = Number(rest.slice(0, bar2));
    const len = rest.length - bar2 - 1;
    if (Number.isInteger(off) && off + len > nextOff) nextOff = off + len;
  } else {
    if (day) return;
    const off = Number(head);
    const len = p.length - bar - 1;
    if (Number.isInteger(off) && off + len > nextOff) nextOff = off + len;
  }
});

const timer = setInterval(() => {
  const done =
    (eofSize !== null && nextOff >= eofSize) || nextOff - startOff >= maxBytes;
  if (done) {
    console.log(`done: ${nextOff - startOff} bytes pulled, next offset ${nextOff}` +
      (eofSize !== null ? ` (file size ${eofSize})` : ""));
    clearInterval(timer);
    client.end();
    return;
  }
  if (nextOff === lastOff) {
    idleTicks++;
    if (idleTicks >= MAX_IDLE_TICKS) {
      console.error(`no progress after ${MAX_IDLE_TICKS} retries at offset ${nextOff} — device offline or no card?`);
      clearInterval(timer);
      client.end();
      process.exit(2);
    }
  } else {
    idleTicks = 0;
  }
  lastOff = nextOff;
  console.log(`  @ ${nextOff}${eofSize !== null ? `/${eofSize}` : ""}`);
  request();
}, TICK_MS);
