// Measure how fast a device can actually serve frame-log chunks.
//
// The pacer (fetch-framelog.ts) reports throughput averaged over its own tick
// cadence, which hides where the ceiling is: a burst that overruns the tick
// looks identical to a device that is merely slow. This sends ONE request and
// timestamps every chunk as it lands, so per-chunk latency is measured directly
// and burst size can be varied against it.
//
//   framelog-probe <token> <day|today> <offset> <n> [repeats]
//
// Run where the broker is reachable without the device ACL (the internal
// listener), same as the pacer.
import mqtt from "mqtt";

const [, , token, dayArg, offArg, nArg, repArg] = process.argv;
if (!token || !dayArg) {
  console.error("usage: framelog-probe <token> <day|today> <offset> <n> [repeats]");
  process.exit(1);
}
const day = dayArg === "today"
  ? (() => { const d = new Date(); const p = (n: number) => String(n).padStart(2, "0");
      return `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`; })()
  : dayArg;
const startOff = Number(offArg ?? 0);
const n = Number(nArg ?? 16);
const repeats = Number(repArg ?? 3);
const SETTLE_MS = 8000;   // well past the longest observed burst

const url = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
const client = mqtt.connect(url);

type Run = { chunks: number; bytes: number; ms: number };
const runs: Run[] = [];
let t0 = 0, chunks = 0, bytes = 0, last = 0, gaps: number[] = [];

function report(): void {
  if (chunks > 0) runs.push({ chunks, bytes, ms: last - t0 });
  chunks = 0; bytes = 0; gaps = [];
}

const seen = new Set<string>();
let dupes = 0;
let tRequest = 0;
const latencies: number[] = [];
client.on("message", (_t, msg) => {
  const now = Date.now();
  if (chunks === 0) { t0 = now; latencies.push(now - tRequest); }
  else gaps.push(now - last);
  last = now;
  chunks++;
  bytes += msg.length;
  // A device that re-publishes the same offset is spending airtime twice.
  const p = msg.toString();
  const b1 = p.indexOf("|"), b2 = p.indexOf("|", b1 + 1);
  const key = b2 > 0 ? p.slice(0, b2) : p.slice(0, 24);
  if (seen.has(key)) dupes++;
  seen.add(key);
});

let round = 0;
function fire(): void {
  if (round >= repeats) {
    report();
    const tot = runs.reduce((a, r) => ({ chunks: a.chunks + r.chunks, bytes: a.bytes + r.bytes, ms: a.ms + r.ms }),
      { chunks: 0, bytes: 0, ms: 0 });
    console.log(`\nn=${n}  runs=${runs.length}`);
    for (const [i, r] of runs.entries()) {
      console.log(`  run ${i + 1}: ${r.chunks} chunks, ${r.bytes} B in ${r.ms} ms` +
        (r.chunks > 1 ? ` -> ${Math.round(r.ms / (r.chunks - 1))} ms/chunk, ${Math.round(r.bytes / (r.ms / 1000))} B/s` : ""));
    }
    if (tot.chunks > runs.length) {
      console.log(`  MEAN: ${Math.round(tot.ms / (tot.chunks - runs.length))} ms/chunk, ` +
        `${Math.round(tot.bytes / (tot.ms / 1000))} B/s sustained within a burst`);
    }
    console.log(`  distinct offsets: ${seen.size}, repeat deliveries: ${dupes} of ${tot.chunks}`);
    console.log(`  request -> first chunk: ${latencies.map((l) => l + "ms").join(", ")}`);
    client.end();
    process.exit(0);
  }
  if (round > 0) report();
  round++;
  tRequest = Date.now();
  // Same offset every round: identical work for the device, so rounds compare.
  client.publish(`device/sck/${token}/cmd`, JSON.stringify({ act: "framelog", off: startOff, n, d: day }));
  setTimeout(fire, SETTLE_MS);
}

client.on("connect", () => {
  console.log(`probing ${token} day ${day} @ ${startOff}, n=${n}, ${repeats} rounds`);
  client.subscribe(`device/sck/${token}/framelog`, (err) => {
    if (err) { console.error("subscribe failed:", err); process.exit(1); }
    fire();
  });
});
