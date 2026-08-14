import { describe, expect, it } from "vitest";
import { summarySentence } from "./summary";
import { EMPTY_FILTERS, type DashboardFilters } from "./filters";
import { athensDateStartMs, nextAthensMidnight } from "./time";

// 2026-08-09 ~19:30 Athens (16:30 UTC).
const NOW = Date.UTC(2026, 7, 9, 16, 30);
const DATA_START_90D = NOW - 90 * 86_400_000;

function filters(partial: Partial<DashboardFilters>): DashboardFilters {
  return { ...EMPTY_FILTERS, ...partial };
}

function range(y1: number, m1: number, d1: number, y2: number, m2: number, d2: number) {
  return { startMs: athensDateStartMs(y1, m1, d1), endMs: nextAthensMidnight(athensDateStartMs(y2, m2, d2)) };
}

describe("summarySentence", () => {
  it("unfiltered: the city and the real data span", () => {
    const s = summarySentence(EMPTY_FILTERS, DATA_START_90D, NOW);
    expect(s.title).toBe("Ο θόρυβος στην Αθήνα");
    expect(s.qualifiers).toBe("τους τελευταίους 3 μήνες");
  });

  it("30d preset + weekends reads like speech", () => {
    const s = summarySentence(filters({ period: "30d", days: new Set(["weekend"]) }), DATA_START_90D, NOW);
    expect(s.qualifiers).toBe("τον τελευταίο μήνα, μόνο Σαββατοκύριακα");
  });

  it("a date range with the 1st as ordinal, plus peak hours", () => {
    const s = summarySentence(
      filters({ ranges: [range(2026, 7, 1, 2026, 7, 5)], hours: new Set(["peak"]) }),
      DATA_START_90D,
      NOW
    );
    expect(s.qualifiers).toBe("από 1η Αυγούστου μέχρι 5 Αυγούστου, μόνο τις ώρες αιχμής");
  });

  it("a single-day range", () => {
    const s = summarySentence(filters({ ranges: [range(2026, 7, 5, 2026, 7, 5)] }), DATA_START_90D, NOW);
    expect(s.qualifiers).toBe("στις 5 Αυγούστου");
    const first = summarySentence(filters({ ranges: [range(2026, 7, 1, 2026, 7, 1)] }), DATA_START_90D, NOW);
    expect(first.qualifiers).toBe("την 1η Αυγούστου");
  });

  it("locations: one, two, several", () => {
    const pin = (label: string) => ({ lng: 23.7, lat: 37.98, radiusM: 500, label });
    expect(summarySentence(filters({ locations: [pin("Πυθαγόρα 4")] }), DATA_START_90D, NOW).title).toBe(
      "Ο θόρυβος κοντά στην Πυθαγόρα 4"
    );
    expect(
      summarySentence(filters({ locations: [pin("Πυθαγόρα 4"), pin("Αλεξάνδρας 12")] }), DATA_START_90D, NOW).title
    ).toBe("Ο θόρυβος κοντά στην Πυθαγόρα 4 και στην Αλεξάνδρας 12");
    expect(
      summarySentence(filters({ locations: [pin("α"), pin("β"), pin("γ")] }), DATA_START_90D, NOW).title
    ).toBe("Ο θόρυβος σε διάφορες τοποθεσίες της Αθήνας");
  });

  it("hour combos share one μόνο, and days absorb it", () => {
    expect(summarySentence(filters({ hours: new Set(["evening", "night"]) }), DATA_START_90D, NOW).qualifiers).toBe(
      "τους τελευταίους 3 μήνες, μόνο τα βράδια και τις νύχτες"
    );
    expect(
      summarySentence(filters({ days: new Set(["weekend"]), hours: new Set(["night"]) }), DATA_START_90D, NOW)
        .qualifiers
    ).toBe("τους τελευταίους 3 μήνες, μόνο Σαββατοκύριακα, τις νύχτες");
  });

  it("selected months replace the span clause, in accusative", () => {
    const s = summarySentence(filters({ months: new Set([4, 5]) }), DATA_START_90D, NOW);
    expect(s.qualifiers).toBe("τον Μάιο και τον Ιούνιο");
  });

  it("snapshot mode splits into kicker + accusative title", () => {
    const s = summarySentence(EMPTY_FILTERS, DATA_START_90D, NOW, true);
    expect(s.kicker).toBe("στιγμιότυπο από");
    expect(s.title).toBe("τον θόρυβο στην Αθήνα");
  });

  it("day+evening+night covers the clock — no hour clause", () => {
    const s = summarySentence(filters({ hours: new Set(["day", "evening", "night"]) }), DATA_START_90D, NOW);
    expect(s.qualifiers).toBe("τους τελευταίους 3 μήνες");
  });
});
