import { describe, expect, it } from "vitest";
import { readingRow } from "@/lib/api/fixtures";
import { serializeReading } from "@/lib/api/readings";
import { fmtAgo, fmtDurationS, fmtExactTime } from "@/lib/dashboard/format";
import { liveStatus, liveTone, LIVE_TONE_COLOR } from "@/lib/dashboard/liveness";
import {
  bandRangeLabel,
  clockOffsetS,
  fmtClock,
  fmtDuty,
  fmtLevel,
  fmtLmax,
  fmtOptionalDb,
  isLowCoverage,
  isSaturated,
  mergeReadings,
  observedCadenceS,
  SPECTRUM_LABELS,
  spectrumBars,
  spectrumScale,
  spectrumTicks,
  trimToWindow,
} from "./live";

const at = (recorded: string, received: string, extra = {}) =>
  serializeReading(readingRow({ recordedAt: new Date(recorded), receivedAt: new Date(received), ...extra }));

describe("fmtAgo / fmtDurationS", () => {
  it("formats seconds, minutes, hours, days the way the dashboard does", () => {
    expect(fmtAgo(12)).toBe("12δ");
    expect(fmtAgo(89)).toBe("89δ");
    expect(fmtAgo(90)).toBe("2λ");
    expect(fmtAgo(5400)).toBe("~2ω");
    expect(fmtAgo(90000)).toBe("~1ημ");
  });
  it("rounds an age to whole hours and marks it approximate", () => {
    // A round two hours used to render as the silly "2,0ω", and 4.6 h as
    // "4,6ω" — a decimal nobody acts on. Whole hours, tilde for the rest.
    expect(fmtAgo(7200)).toBe("~2ω");
    expect(fmtAgo(16560)).toBe("~5ω"); // 4.6 h
    expect(fmtAgo(89999)).toBe("~25ω");
  });
  it("formats an unsigned duration the same way, without a sign", () => {
    expect(fmtDurationS(-105)).toBe("1λ 45δ");
    expect(fmtDurationS(12)).toBe("12δ");
  });
});

describe("fmtExactTime", () => {
  // The hover sits beside a column that is pinned to Athens. A viewer in
  // London or New York must read the same instant in both places, so the
  // formatter may not follow the viewer's zone.
  const instant = "2026-09-22T23:30:00.000Z"; // 02:30 the NEXT day in Athens
  it("renders a known instant in Athens time whatever the ambient zone is", () => {
    const original = process.env.TZ;
    try {
      for (const tz of ["UTC", "Europe/London", "America/New_York", "Australia/Sydney"]) {
        process.env.TZ = tz;
        expect(fmtExactTime(instant)).toBe("23 Σεπ 2026, 2:30:00 π.μ.");
      }
    } finally {
      process.env.TZ = original;
    }
  });
  it("returns undefined for null/undefined, so a call site needs no guard", () => {
    expect(fmtExactTime(null)).toBeUndefined();
    expect(fmtExactTime(undefined)).toBeUndefined();
  });
});

describe("mergeReadings", () => {
  const a = at("2026-09-22T09:29:39Z", "2026-09-22T09:27:54Z");
  const b = at("2026-09-22T09:29:09Z", "2026-09-22T09:27:24Z");
  const c = at("2026-09-22T09:30:09Z", "2026-09-22T09:28:24Z");

  it("unions by recordedAt and orders newest receivedAt first", () => {
    const merged = mergeReadings([a, b], [c, a]);
    expect(merged.map((r) => r.recordedAt)).toEqual([c.recordedAt, a.recordedAt, b.recordedAt]);
  });

  it("lets a replayed row replace its older copy", () => {
    // Same recordedAt as `a` (the key), different laeq: a replay must
    // replace the existing row, not create a phantom second one.
    const a2 = { ...a, laeq: 70 };
    const merged = mergeReadings([a], [a2]);
    expect(merged.length).toBe(1);
    expect(merged[0].laeq).toBe(70);
  });
});

describe("trimToWindow", () => {
  const floorMs = Date.parse("2026-09-22T09:00:00Z");

  it("keeps a replayed row that ARRIVED inside the window, however old its device stamp", () => {
    // Store-and-forward: recorded three days ago, inserted 20 s ago. A
    // recordedAt filter would drop the row that just landed.
    const replay = at("2026-09-19T04:00:00Z", "2026-09-22T09:30:00Z");
    expect(trimToWindow([replay], floorMs).map((r) => r.receivedAt)).toEqual([replay.receivedAt]);
  });

  it("drops a row that arrived before the floor, however fresh its device stamp", () => {
    const early = at("2026-09-22T09:45:00Z", "2026-09-22T08:59:59Z");
    expect(trimToWindow([early], floorMs)).toEqual([]);
  });

  it("is inclusive at the boundary", () => {
    const onFloor = at("2026-09-22T09:10:00Z", "2026-09-22T09:00:00Z");
    expect(trimToWindow([onFloor], floorMs).length).toBe(1);
  });

  it("keeps the order it was given", () => {
    const rows = [
      at("2026-09-22T09:31:00Z", "2026-09-22T09:30:00Z"),
      at("2026-09-19T04:00:00Z", "2026-09-22T09:20:00Z"),
      at("2026-09-22T08:50:00Z", "2026-09-22T08:49:00Z"),
    ];
    expect(trimToWindow(rows, floorMs).map((r) => r.receivedAt)).toEqual([
      rows[0].receivedAt,
      rows[1].receivedAt,
    ]);
  });
});

describe("liveness (shared with the sensor pane and /status)", () => {
  const now = Date.parse("2026-09-22T09:28:06Z");
  it("is live under two minutes, stale under an hour, dead after", () => {
    expect(liveStatus("2026-09-22T09:27:54Z", now)).toEqual({ ageS: 12, tone: "live" });
    expect(liveStatus("2026-09-22T09:14:06Z", now).tone).toBe("stale");
    expect(liveStatus("2026-09-22T07:00:00Z", now).tone).toBe("dead");
    expect(liveStatus(null, now)).toEqual({ ageS: null, tone: "never" });
  });
  it("never goes negative when the server clock is behind", () => {
    expect(liveStatus("2026-09-22T09:28:10Z", now).ageS).toBe(0);
  });
  it("maps tones to the palette the pane already uses", () => {
    expect(liveTone(119)).toBe("live");
    expect(liveTone(120)).toBe("stale");
    expect(liveTone(null)).toBe("never");
    expect(LIVE_TONE_COLOR.live).toBe("var(--sw-ok)");
    expect(LIVE_TONE_COLOR.stale).toBe("var(--sw-slate)");
    expect(LIVE_TONE_COLOR.dead).toBe("var(--sw-loud)");
    expect(LIVE_TONE_COLOR.never).toBe("var(--sw-silver)");
  });
});

describe("clockOffsetS / observedCadenceS", () => {
  it("reads the device clock offset from one row", () => {
    expect(clockOffsetS(at("2026-09-22T09:29:39Z", "2026-09-22T09:27:54Z"))).toBe(105);
  });
  it("takes the median receivedAt gap, and the fallback when there is nothing to measure", () => {
    const rows = [
      at("2026-09-22T09:29:39Z", "2026-09-22T09:27:54Z"),
      at("2026-09-22T09:29:09Z", "2026-09-22T09:27:24Z"),
      at("2026-09-22T09:28:39Z", "2026-09-22T09:26:54Z"),
      at("2026-09-22T09:28:09Z", "2026-09-22T09:26:24Z"),
      at("2026-09-22T09:27:39Z", "2026-09-22T09:26:11Z"),
    ];
    expect(observedCadenceS(rows, 60)).toBe(30);
    expect(observedCadenceS([rows[0]], 60)).toBe(60);
    expect(observedCadenceS([], 60)).toBe(60);
  });
});

describe("fmtClock", () => {
  it("shows Athens wall time with seconds", () => {
    expect(fmtClock("2026-09-22T06:29:39.000Z")).toBe("09:29:39");
  });
});

describe("fmtLevel / fmtLmax", () => {
  const censored = serializeReading(readingRow()); // fixture: topBinCensored true, l10 88.09
  const clean = serializeReading(readingRow({ histRaw: "0-0-0-0-0-0-0-0-1-23-111-101-62-31-23-15-12-10-14-9-15-11-6-12-10-9-7-14-7-0", l10: 70.2, lmaxEst: 80.1 }));
  it("renders a censored percentile as a bound with a Greek comma", () => {
    expect(fmtLevel(censored.l10, censored)).toEqual({ text: "≥ 88,1", bound: "lower" });
    expect(fmtLevel(censored.l50, censored)).toEqual({ text: "52,3", bound: null });
    expect(fmtLevel(null, censored)).toEqual({ text: "—", bound: null });
  });
  it("renders Lmax as a lower bound whenever the interval touched the top bin", () => {
    expect(fmtLmax(censored)).toEqual({ text: "≥ 106,2", bound: "lower" });
    expect(fmtLmax(clean)).toEqual({ text: "80,1", bound: null });
  });
});

describe("fmtOptionalDb / fmtDuty", () => {
  it("renders null as a dash and numbers with a Greek comma", () => {
    expect(fmtOptionalDb(null)).toBe("—");
    expect(fmtOptionalDb(74.2)).toBe("74,2");
    expect(fmtDuty(null)).toBe("—");
    expect(fmtDuty(0.288)).toBe("28,8 %");
  });
});

describe("isLowCoverage", () => {
  it("flags an interval below the low-coverage threshold, not one at or above it, and not null", () => {
    expect(isLowCoverage(0.03)).toBe(true);
    expect(isLowCoverage(0.288)).toBe(false);
    expect(isLowCoverage(null)).toBe(false);
  });
});

describe("isSaturated", () => {
  const withSat = (n: number | null) => serializeReading(readingRow({ energySaturations: n }));
  it("treats null as unknown, not as zero", () => {
    // schemas.ts: null means firmware too old to report the counter. Reading
    // it as "no saturations" is right by accident; reading it as 0 > 0 being
    // false is the behaviour we want to pin, so nobody flips it to `!= null`.
    expect(isSaturated(withSat(null))).toBe(false);
    expect(isSaturated(withSat(0))).toBe(false);
    expect(isSaturated(withSat(3))).toBe(true);
  });
});

describe("spectrum", () => {
  const bands = serializeReading(readingRow()).bandsDb;
  it("labels 21 bands and scales heights into 0..1 on the fixed 85-120 scale", () => {
    const bars = spectrumBars(bands);
    expect(bars.length).toBe(21);
    expect(SPECTRUM_LABELS[0]).toBe("LOW");
    expect(SPECTRUM_LABELS[8]).toBe("1,25k");
    expect(SPECTRUM_LABELS[20]).toBe("20k");
    expect(bars[0].height).toBe(0); // 55.1 is below the floor
    expect(bars[20].height).toBe(0); // 74.0 is below the floor too
    expect(spectrumBars([120, ...Array(20).fill(null)])[0].height).toBe(1);
    expect(spectrumBars([200, ...Array(20).fill(null)])[0].height).toBe(1);
  });
  it("handles null bands", () => {
    expect(spectrumBars(null)).toEqual([]);
  });
});

describe("spectrumTicks / bandRangeLabel", () => {
  it("ticks every 10 dB inside the scale", () => {
    expect(spectrumTicks({ min: 50, max: 115 })).toEqual([50, 60, 70, 80, 90, 100, 110]);
    expect(spectrumTicks({ min: 25, max: 65 })).toEqual([30, 40, 50, 60]);
  });
  it("names a band's frequency range", () => {
    expect(bandRangeLabel(0)).toBe("86–258 Hz");
    // Both edges land under 1 kHz, so each gets its own " Hz" suffix — the
    // formula concatenates f(lo) and f(hi) independently, it doesn't dedupe
    // a repeated unit (unlike the 891 Hz–1,1 kHz case, where the units differ).
    expect(bandRangeLabel(1)).toBe("223 Hz–281 Hz");
    expect(bandRangeLabel(7)).toBe("891 Hz–1,1 kHz");
    expect(bandRangeLabel(20)).toBe("17,8 kHz–22,4 kHz");
  });
});

describe("spectrumScale", () => {
  const withBands = (bands: (number | null)[]) => serializeReading(readingRow({ bandsDb: bands }));
  it("falls back to the street scale with no bands", () => {
    expect(spectrumScale([])).toEqual({ min: 85, max: 120 });
    expect(spectrumScale([withBands(Array(21).fill(null))])).toEqual({ min: 85, max: 120 });
  });
  it("fits the window with 5 dB padding, snapped to 5", () => {
    expect(spectrumScale([withBands([36.2, ...Array(19).fill(45), 59])])).toEqual({ min: 30, max: 65 });
  });
  it("never goes narrower than 30 dB", () => {
    expect(spectrumScale([withBands(Array(21).fill(50))])).toEqual({ min: 35, max: 65 });
  });
  it("scales bars on the scale it is given", () => {
    const bars = spectrumBars([30, 65, ...Array(19).fill(null)], { min: 30, max: 65 });
    expect(bars[0].height).toBe(0);
    expect(bars[1].height).toBe(1);
  });
});
