import { describe, it, expect } from "vitest";
import { interpret, decide, progressLine, BURST, CHUNK } from "./fetch-framelog";

// Pacing decisions. The device answers a burst in ~73 ms/chunk regardless of
// burst size, so a 16-chunk burst lands in ~1.2 s; the old fixed 4 s tick then
// idled ~70% of the time. These pin the event-driven replacement.
describe("decide", () => {
  const base = {
    nextOff: 10000, startOff: 0, maxBytes: 256 * 1024,
    eofSize: null as number | null, burstComplete: false,
    msSinceProgress: 0, stallMs: 30000, emptyRounds: 0,
  };

  it("requests the next burst immediately when the last one completed", () => {
    expect(decide({ ...base, burstComplete: true })).toEqual({ kind: "request", off: 10000, delayMs: 0 });
  });

  it("stops when EOF has been reached", () => {
    expect(decide({ ...base, nextOff: 6546672, eofSize: 6546672 })).toEqual({ kind: "done", bytes: 6546672 });
  });

  it("stops when the byte cap is reached", () => {
    expect(decide({ ...base, nextOff: 300000, maxBytes: 256 * 1024 })).toEqual({ kind: "done", bytes: 300000 });
  });

  it("gives up once nothing has arrived for the stall window", () => {
    expect(decide({ ...base, msSinceProgress: 30000 })).toEqual({ kind: "give-up", at: 10000 });
  });

  // A partial burst is normal: chunks drop. Resume from what actually landed
  // rather than re-requesting the whole burst.
  it("resumes from the contiguous high-water mark after a partial burst", () => {
    const d = decide({ ...base, nextOff: 12160, burstComplete: false, emptyRounds: 0 });
    expect(d).toMatchObject({ kind: "request", off: 12160 });
  });

  it("backs off progressively while nothing is arriving", () => {
    const delays = [0, 1, 2, 3, 4].map(
      (r) => (decide({ ...base, emptyRounds: r }) as { delayMs: number }).delayMs,
    );
    expect(delays).toEqual([500, 1000, 2000, 4000, 4000]);   // capped, never hammering
  });

  it("does not back off at all once progress resumes", () => {
    expect(decide({ ...base, burstComplete: true, emptyRounds: 4 })).toMatchObject({ delayMs: 0 });
  });

  it("prefers done over give-up when both could apply", () => {
    expect(decide({ ...base, nextOff: 300000, msSinceProgress: 99999 }).kind).toBe("done");
  });
});

// A full day takes ~64 min. Without a heartbeat that is an hour of silence in
// the log, and a stalled pull looks exactly like a working one.
describe("progressLine", () => {
  it("reports offset, bytes moved and rate", () => {
    expect(progressLine({ nextOff: 120000, startOff: 20000, eofSize: null, elapsedMs: 60000 }))
      .toBe("  @ 120000 — 100000 B in 60s (1667 B/s)");
  });

  it("includes the file size once EOF has been seen", () => {
    expect(progressLine({ nextOff: 120000, startOff: 20000, eofSize: 6546672, elapsedMs: 60000 }))
      .toBe("  @ 120000/6546672 — 100000 B in 60s (1667 B/s)");
  });

  it("says so plainly when nothing has moved", () => {
    expect(progressLine({ nextOff: 20000, startOff: 20000, eofSize: null, elapsedMs: 30000 }))
      .toBe("  @ 20000 — no progress in 30s");
  });

  it("does not divide by zero on the first tick", () => {
    expect(progressLine({ nextOff: 21000, startOff: 20000, eofSize: null, elapsedMs: 0 }))
      .toBe("  @ 21000 — 1000 B in 0s");
  });
});

describe("burst sizing", () => {
  it("asks for the largest burst the device will serve", () => {
    expect(BURST).toBe(32);          // sendFrameLog caps maxChunks at 32
    expect(CHUNK).toBe(360);
  });
});

// Real body bytes from a device's FL file: digits and commas, never a "|".
const BODY = "1785773070,107,108,106,111,116,112,109,112,98";

describe("interpret", () => {
  it("advances on a chunk for the day it asked for", () => {
    expect(interpret(`260806|100080|${BODY}`, "260806")).toEqual({
      kind: "chunk", end: 100080 + BODY.length,
    });
  });

  // serve-mute regression: offset size must not change how a chunk is read.
  it("advances at any offset size", () => {
    for (const off of [99720, 100080, 999999, 1000080]) {
      expect(interpret(`260806|${off}|${BODY}`, "260806")).toEqual({
        kind: "chunk", end: off + BODY.length,
      });
    }
  });

  it("takes EOF for the requested day", () => {
    expect(interpret("EOF|260806|4063800", "260806")).toEqual({ kind: "eof", size: 4063800 });
  });

  it("ignores a chunk from a day it did not ask for", () => {
    expect(interpret(`260805|100080|${BODY}`, "260806")).toBeNull();
  });

  it("ignores EOF for another day", () => {
    expect(interpret("EOF|260805|4063800", "260806")).toBeNull();
  });

  // A 1.1 unit falls back to an orphaned FRAMELOG.CSV when the requested day
  // has no file, and answers UNTAGGED. That namespace is retired, so those are
  // ignored -- but the caller is told, so the pull does not just time out.
  it("reports an untagged answer as a retired-namespace fallback", () => {
    expect(interpret(`100080|${BODY}`, "260806")).toEqual({ kind: "legacy-ignored" });
    expect(interpret("EOF|16334576", "260806")).toEqual({ kind: "legacy-ignored" });
  });

  it("returns null on garbage without throwing", () => {
    expect(interpret("", "260806")).toBeNull();
    expect(interpret("no-separator", "260806")).toBeNull();
  });
});
