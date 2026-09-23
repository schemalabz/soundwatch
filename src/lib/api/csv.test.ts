import { describe, expect, it } from "vitest";
import { CSV_HEADER, csvFilename, readingsToCsv } from "./csv";
import { readingRow } from "./fixtures";
import { READING_COLUMNS, serializeReading } from "./readings";

const older = serializeReading(
  readingRow({
    recordedAt: new Date("2026-08-12T09:59:30Z"),
    receivedAt: new Date("2026-08-12T09:59:35Z"),
    laeq: 60.5,
    energySaturations: null,
    bandsDb: null,
    histRaw: null,
  })
);
const newer = serializeReading(readingRow());

describe("CSV_HEADER", () => {
  it("names every flat column by the database column it comes from", () => {
    // The CSV is a subset of READING_COLUMNS plus the two derived censoring
    // flags. A column renamed in the schema must break this, not drift.
    const known = new Set([
      ...Object.values(READING_COLUMNS),
      "l10_bound",
      "l50_bound",
      "l90_bound",
      "top_bin_censored",
      "bottom_bin_censored",
    ]);
    for (const name of CSV_HEADER.slice(0, 23)) expect(known.has(name), name).toBe(true);
    for (const name of CSV_HEADER.slice(23, 44)) expect(name.startsWith("band_")).toBe(true);
    for (const name of CSV_HEADER.slice(44)) expect(name.startsWith("hist_")).toBe(true);
  });

  it("has the flat fields, then 21 bands, then 30 histogram bins", () => {
    expect(CSV_HEADER.length).toBe(23 + 21 + 30);
    expect(CSV_HEADER.slice(0, 4)).toEqual(["recorded_at", "received_at", "laeq", "l10"]);
    // The three verdicts sit beside the percentiles they are about.
    expect(CSV_HEADER.slice(5, 9)).toEqual(["l90", "l10_bound", "l50_bound", "l90_bound"]);
    expect(CSV_HEADER[23]).toBe("band_low");
    expect(CSV_HEADER[24]).toBe("band_250");
    expect(CSV_HEADER[43]).toBe("band_20000");
    expect(CSV_HEADER[44]).toBe("hist_30");
    expect(CSV_HEADER[73]).toBe("hist_88");
  });
});

describe("readingsToCsv", () => {
  const text = readingsToCsv([newer, older]);
  const lines = text.split("\n");

  it("starts with the header and ends with a newline", () => {
    expect(lines[0]).toBe(CSV_HEADER.join(","));
    expect(text.endsWith("\n")).toBe(true);
  });

  it("writes rows oldest first, one per reading, all columns present", () => {
    expect(lines.length).toBe(1 + 2 + 1);
    expect(lines[1].split(",").length).toBe(CSV_HEADER.length);
    expect(lines[1].startsWith("2026-08-12T09:59:30.000Z,2026-08-12T09:59:35.000Z,60.5,")).toBe(true);
    expect(lines[2].startsWith("2026-08-12T10:00:00.000Z,2026-08-12T10:00:05.000Z,86.99,")).toBe(true);
  });

  it("uses a decimal point, true/false for flags, and empty cells for null", () => {
    const cells = lines[2].split(",");
    expect(cells[CSV_HEADER.indexOf("top_bin_censored")]).toBe("true");
    expect(cells[CSV_HEADER.indexOf("realized_duty")]).toBe("0.31");
    expect(cells[CSV_HEADER.indexOf("band_low")]).toBe("55.1");
    expect(cells[CSV_HEADER.indexOf("hist_88")]).toBe("59");
    const olderCells = lines[1].split(",");
    expect(olderCells[CSV_HEADER.indexOf("energy_saturations")]).toBe("");
    expect(olderCells[CSV_HEADER.indexOf("band_low")]).toBe("");
    expect(olderCells[CSV_HEADER.indexOf("hist_30")]).toBe("");
  });

  it("marks only the percentile that actually lands in the open-ended top bin", () => {
    // The fixture's top bin holds 59 of 689 frames, so top_bin_censored is
    // true — but only l10 (88.09) sits at the 88 dB ceiling. l50 (52.3) is an
    // exact value. This is the distinction the flag alone cannot make, and the
    // reason a consumer should read the *_bound columns instead of it.
    const cells = lines[2].split(",");
    expect(cells[CSV_HEADER.indexOf("top_bin_censored")]).toBe("true");
    expect(cells[CSV_HEADER.indexOf("l10_bound")]).toBe("lower");
    expect(cells[CSV_HEADER.indexOf("l50_bound")]).toBe("");
    expect(cells[CSV_HEADER.indexOf("l90_bound")]).toBe("");
  });
});

describe("csvFilename", () => {
  it("slugs the name and compacts the window", () => {
    expect(csvFilename("Βαλτινών Γκύζη", "32696d65-d01f", "2026-09-22T06:29:39.000Z", "2026-09-22T09:29:39.000Z")).toBe(
      "soundwatch-βαλτινών-γκύζη-20260922T0629-20260922T0929.csv"
    );
  });
  it("falls back to the id and open bounds", () => {
    expect(csvFilename(null, "32696d65-d01f-4655", undefined, undefined)).toBe("soundwatch-32696d65-start-now.csv");
  });

  it("caps the slug so a long name cannot blow the response header buffer", () => {
    // The name goes into both Content-Disposition forms, and a Greek
    // character costs nine bytes once percent-encoded: uncapped, a 5,000
    // character name built a 30 KB header set, which a proxy with the usual
    // 4-8 KB buffer answers with a 502.
    const name = "Βαλτινών Γκύζη ".repeat(400);
    const filename = csvFilename(name, "32696d65-d01f", undefined, undefined);
    const header = `attachment; filename="${filename.replace(/[^\x20-\x7E]/g, "-")}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
    expect(header.length).toBeLessThan(1024);
    // Both forms survive the cap, and the file is still named after the sensor.
    expect(header).toContain('filename="soundwatch-');
    expect(header).toContain("filename*=UTF-8''soundwatch-%CE%B2");
    expect(filename.startsWith("soundwatch-βαλτινών-γκύζη-")).toBe(true);
    expect(filename.endsWith("-start-now.csv")).toBe(true);
  });

  it("cuts the slug by code point, never through a surrogate pair", () => {
    // A cut through a pair would leave a lone surrogate, and
    // encodeURIComponent throws URIError on one — turning a long name from a
    // 502 into a 500.
    const filename = csvFilename("𝐀".repeat(200), "32696d65-d01f", undefined, undefined);
    expect(() => encodeURIComponent(filename)).not.toThrow();
  });
});
