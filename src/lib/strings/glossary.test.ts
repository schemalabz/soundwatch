import { describe, expect, it } from "vitest";
import { GLOSSARY, GLOSSARY_ORDER, LEVEL_CAVEAT, METRICS, metricLabel } from "./glossary";
import { dashboardStrings } from "./dashboard";
import { sensorStrings } from "./sensor";
import { HIST_TOP_DB, TOP_BIN_FLOOR_DB } from "@/lib/api/levels";
import { HIST_BIN_DB, HIST_BINS, HIST_MIN_DB } from "../../../mqtt-ingester/flavor2";
import { AGG_KEYS } from "@/lib/dashboard/metrics";

describe("glossary", () => {
  it("orders every entry exactly once", () => {
    expect([...GLOSSARY_ORDER].sort()).toEqual(Object.keys(GLOSSARY).sort());
    expect(new Set(GLOSSARY_ORDER).size).toBe(GLOSSARY_ORDER.length);
  });

  it("the dashboard derives its names and caveat from the glossary", () => {
    expect(dashboardStrings.aggregations.laeq.label).toBe(METRICS.laeq.label);
    expect(dashboardStrings.aggregations.l10.hint).toBe(METRICS.l10.hint.rollup);
    expect(dashboardStrings.uncalibrated).toBe(LEVEL_CAVEAT);
    // The guide entry adds what a decibel is, then carries the shared caveat
    // verbatim — so the sentence the dashboard shows and the sentence the
    // guide shows can never drift apart.
    expect(GLOSSARY.level.long).toContain(LEVEL_CAVEAT);
    for (const k of AGG_KEYS) {
      if (k === "lmax") {
        // Same frame statistic in both: Lmax is the loudest single frame,
        // whether "frame" ranges over one interval or across many.
        expect(METRICS[k].hint.interval).toBe(METRICS[k].hint.rollup);
      } else {
        expect(METRICS[k].hint.interval).not.toBe(METRICS[k].hint.rollup);
      }
    }
  });

  it("declares Lmin's label and code once, and keeps it out of the dashboard's picker", () => {
    // The log used to recover "Ελάχιστη" with tr.card.lmin.split(" ")[0] and
    // spell "Lmin" as a literal in three places.
    // Brackets, not a bare space: "Μέση LAeq" read as "average LAeq", an
    // average OF Leq values, when Leq already IS the energy average.
    expect(metricLabel("lmin")).toBe(`${METRICS.lmin.label} (${METRICS.lmin.code})`);
    expect(metricLabel("laeq")).toBe("Μέση (LAeq)");
    // Lmin is interval-only: the dashboard computes no across-intervals
    // sibling, so the metric picker must still carry exactly the five.
    expect(Object.keys(dashboardStrings.aggregations).sort()).toEqual([...AGG_KEYS].sort());
    expect(dashboardStrings.aggregations).not.toHaveProperty("lmin");
  });

  it("quotes the histogram's numbers from the constants", () => {
    // 88 is TOP_BIN_FLOOR_DB, derived from HIST_MIN_DB/HIST_BINS/HIST_BIN_DB.
    // The Greek sentences template it rather than retyping it.
    expect(GLOSSARY.lowerBound.short).toContain(String(TOP_BIN_FLOOR_DB));
    expect(GLOSSARY.lowerBound.long).toContain(`${HIST_BINS} κουτάκια των ${HIST_BIN_DB} dB`);
    expect(GLOSSARY.lowerBound.long).toContain(`από τα ${HIST_MIN_DB} ως τα ${HIST_TOP_DB} dB`);
    expect(sensorStrings.log.boundNote).toContain(`(≥ ${TOP_BIN_FLOOR_DB})`);
  });

  it("speaks to a reader who knows nothing about sound", () => {
    for (const entry of Object.values(GLOSSARY)) {
      expect(entry.short.length).toBeGreaterThan(20);
      expect(entry.long.length).toBeGreaterThan(entry.short.length);
      expect(entry.long).not.toMatch(/ηχόμετρ|ηχομέτρ|dB\(A\)/);
    }
  });
});
