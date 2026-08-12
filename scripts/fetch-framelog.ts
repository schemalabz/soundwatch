// SD-path v1: server-paced framelog pull.
//
// Publishes {"act":"framelog","off":N,"n":k} on the device's cmd topic and
// advances from the chunks that come back (the ingester stores them; this
// script only paces). Device bursts are bounded, so pacing lives here.
//
// Run where the broker is reachable without the device ACL — i.e. the internal
// listener. Ships inside the ingester image, so on the droplet:
//   docker run --rm --network <net> -e MQTT_BROKER_URL=mqtt://mosquitto:1884 \
//     <ingester-image> npx tsx scripts/fetch-framelog.ts <token> <YYMMDD> [off] [maxBytes]
// Normally invoked by scripts/framelog-pull.sh from cron, not by hand.
import mqtt from "mqtt";

// What a received payload means for the pull, given the namespace we asked for.
// Pure and exported so it can be tested without a broker; the puller below only
// runs when this file is executed directly.
export const BURST = 32;        // sendFrameLog caps maxChunks at 32
export const CHUNK = 360;       // fits NETBUFF 512 with topic + JSON overhead
const QUIET_MS = 500;           // chunks land ~73 ms apart; this is a real gap
const BACKOFF_MS = 500;         // first retry after an empty round
const BACKOFF_MAX_MS = 4000;
const STALL_MS = 30000;         // no progress at all for this long = give up
const PROGRESS_MS = 30000;      // heartbeat: a 64-minute pull must not be silent

export type WireEvent =
  | { kind: "chunk"; end: number }
  | { kind: "eof"; size: number }
  | { kind: "legacy-ignored" };

// A full day is ~64 minutes. Without a heartbeat that is an hour of silence,
// and a wedged pull is indistinguishable from a working one.
export function progressLine(s: {
  nextOff: number; startOff: number; eofSize: number | null; elapsedMs: number;
}): string {
  const at = `  @ ${s.nextOff}${s.eofSize !== null ? `/${s.eofSize}` : ""}`;
  const secs = Math.round(s.elapsedMs / 1000);
  const bytes = s.nextOff - s.startOff;
  if (bytes === 0) return `${at} — no progress in ${secs}s`;
  if (secs === 0) return `${at} — ${bytes} B in 0s`;
  return `${at} — ${bytes} B in ${secs}s (${Math.round(bytes / secs)} B/s)`;
}

export type PacerDecision =
  | { kind: "done"; bytes: number }
  | { kind: "give-up"; at: number }
  | { kind: "request"; off: number; delayMs: number };

// What to do next, given only observable state. Pure, so the pacing policy is
// testable without a broker or a clock.
//
// The device serves a chunk every ~73 ms whatever the burst size, so a burst
// completes in ~1.2 s (16) or ~2.3 s (32). The previous pacer re-requested on a
// fixed 4 s timer and therefore idled ~70% of the time; here a completed burst
// is requested again at once and only an incomplete one waits.
export function decide(s: {
  nextOff: number;
  startOff: number;
  maxBytes: number;
  eofSize: number | null;
  burstComplete: boolean;
  msSinceProgress: number;
  stallMs: number;
  emptyRounds: number;
}): PacerDecision {
  // Finishing beats giving up: a stalled pull that already has what it came for
  // is a success, not a failure.
  if (s.eofSize !== null && s.nextOff >= s.eofSize) return { kind: "done", bytes: s.nextOff };
  if (s.nextOff - s.startOff >= s.maxBytes) return { kind: "done", bytes: s.nextOff };
  if (s.msSinceProgress >= s.stallMs) return { kind: "give-up", at: s.nextOff };
  // Resume from the contiguous high-water mark; chunks are idempotent, so
  // re-asking for ones that did land costs only their airtime.
  if (s.burstComplete) return { kind: "request", off: s.nextOff, delayMs: 0 };
  const delayMs = Math.min(BACKOFF_MS * 2 ** s.emptyRounds, BACKOFF_MAX_MS);
  return { kind: "request", off: s.nextOff, delayMs };
}

// Mirrors isDay in mqtt-ingester/framelog.ts. Deliberately duplicated: this
// runs as a one-shot container and the ingester as a long-lived one, and a
// shared import would make a parser change silently reshape both at once.
// Keep the two in step by hand — the tests on each side pin the same contract.
function isDay(s: string): boolean {
  if (!/^\d{6}$/.test(s)) return false;
  const month = Number(s.slice(2, 4));
  const day = Number(s.slice(4, 6));
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

// Day-rotated only; see the header of mqtt-ingester/framelog.ts for why the
// untagged legacy form is refused rather than disambiguated.
export function interpret(p: string, requestedDay: string): WireEvent | null {
  const bar = p.indexOf("|");
  if (bar <= 0) return null;
  const head = p.slice(0, bar);
  const rest = p.slice(bar + 1);
  const bar2 = rest.indexOf("|");

  // No second field: an untagged legacy payload. The device fell back to an
  // orphaned FRAMELOG.CSV because the day we asked for has no file. Reported
  // rather than dropped so the caller can say so instead of timing out.
  if (bar2 <= 0) return /^\d+$/.test(head) || head === "EOF" ? { kind: "legacy-ignored" } : null;

  const tag = rest.slice(0, bar2);
  const tail = rest.slice(bar2 + 1);

  if (head === "EOF") {
    if (!isDay(tag)) return null;
    if (tag !== requestedDay) return null;
    return /^\d+$/.test(tail) ? { kind: "eof", size: Number(tail) } : null;
  }

  if (!isDay(head) || !/^\d+$/.test(tag)) {
    // A six-digit offset with pipe-free CSV behind it is the retired form.
    return /^\d+$/.test(head) ? { kind: "legacy-ignored" } : null;
  }
  if (head !== requestedDay) return null;   // another day's file: not ours
  return { kind: "chunk", end: Number(tag) + tail.length };
}

function main(): void {
const token = process.argv[2];
if (!token) {
  console.error("usage: fetch-framelog <token> [day] [startOffset] [maxBytes]");
  console.error("  day: YYMMDD | today | yesterday   (default today)");
  process.exit(1);
}
function resolveDay(arg: string | undefined): string {
  const d = arg ?? "today";
  if (d === "legacy") {
    console.error("the legacy single-file namespace is retired — pass a YYMMDD day");
    process.exit(1);
  }
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

const url = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
const client = mqtt.connect(url);
const cmdTopic = `device/sck/${token}/cmd`;
const chunkTopic = `device/sck/${token}/framelog`;

let eofSize: number | null = null;
let emptyRounds = 0;
let lastProgressAt = Date.now();
let expectedEnd = 0;            // where the in-flight burst should reach
let quietTimer: NodeJS.Timeout | undefined;
let finished = false;
const began = Date.now();
const heartbeat = setInterval(
  () => console.log(progressLine({ nextOff, startOff, eofSize, elapsedMs: Date.now() - began })),
  PROGRESS_MS,
);

let offAtRequest = -1;
function request(): void {
  offAtRequest = nextOff;
  expectedEnd = nextOff + BURST * CHUNK;
  client.publish(cmdTopic, JSON.stringify({ act: "framelog", off: nextOff, n: BURST, d: day }));
  armQuiet();
}

// A burst is "done" either when it reaches where it should, or when the wire
// has been silent long enough that the rest is not coming.
function armQuiet(): void {
  clearTimeout(quietTimer);
  quietTimer = setTimeout(() => step(false), QUIET_MS);
}

function step(burstComplete: boolean): void {
  if (finished) return;
  clearTimeout(quietTimer);
  // A round that moved nothing means the device is busy, gone, or past the end;
  // back off rather than hammering it (each request costs it a file open+seek).
  if (!burstComplete) emptyRounds = nextOff === offAtRequest ? emptyRounds + 1 : 0;
  const d = decide({
    nextOff, startOff, maxBytes, eofSize, burstComplete,
    msSinceProgress: Date.now() - lastProgressAt, stallMs: STALL_MS, emptyRounds,
  });
  if (d.kind === "done" || d.kind === "give-up") {
    finished = true;
    clearInterval(heartbeat);
    const secs = (Date.now() - began) / 1000;
    const bytes = nextOff - startOff;
    if (d.kind === "done") {
      console.log(`done: ${bytes} bytes pulled in ${secs.toFixed(1)}s ` +
        `(${Math.round(bytes / secs)} B/s), next offset ${nextOff}` +
        (eofSize !== null ? ` (file size ${eofSize})` : ""));
      client.end();
    } else {
      console.error(`no progress for ${STALL_MS / 1000}s at offset ${d.at} — device offline or no card?`);
      client.end();
      process.exitCode = 2;
    }
    return;
  }
  if (d.delayMs === 0) request();
  else setTimeout(request, d.delayMs);
}

client.on("connect", () => {
  console.log(`pulling framelog from ${token} day ${day} @ ${nextOff} via ${url}`);
  client.subscribe(chunkTopic, (err) => {
    if (err) { console.error("subscribe failed:", err); process.exit(1); }
    request();
  });
});

let warnedLegacy = false;
client.on("message", (_t, msg) => {
  const r = interpret(msg.toString(), day);
  if (!r) return;
  if (r.kind === "legacy-ignored") {
    // Answered from an orphaned FRAMELOG.CSV: the device has no file for this
    // day. Say so once, or the pull just looks like an unexplained timeout.
    if (!warnedLegacy) {
      warnedLegacy = true;
      console.error(`${token} has no FL${day}.CSV and fell back to the retired legacy file — ignoring`);
    }
    return;
  }
  if (r.kind === "eof") {
    eofSize = r.size;
    step(true);                       // nothing further is coming for this day
    return;
  }
  if (r.end > nextOff) {
    nextOff = r.end;
    lastProgressAt = Date.now();
    emptyRounds = 0;
    if (nextOff >= expectedEnd) { step(true); return; }   // burst complete — go now
  }
  armQuiet();                         // still arriving; keep waiting
});
}

// Only pull when run as a script; importing this file (tests) must be inert.
if (/fetch-?framelog|fetch\.ts/.test(process.argv[1] ?? "")) main();
