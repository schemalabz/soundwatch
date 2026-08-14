import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Ported from main's src/lib/metrics.test.ts, which this branch deleted along
// with the module it tested. The guard is worth more than the module was: the
// unit had been hardcoded in three components and two locale strings, so
// fixing the metric definition alone left "dBA" on screen — and it was found
// by rendering against real data, not by reading the code.
//
// Every level we publish is UNCALIBRATED device-dB with an arbitrary zero.
// "68" is not 68 dB(A) and must never be labelled or compared as though it
// were. See the firmware repo's measurement-contract.md.
describe("no dBA claim survives anywhere user-facing", () => {
  // The roots were src/components/dashboard, src/lib/strings and src/app. That
  // scanned 46 files and missed the ones that matter most: format.ts formats
  // every dB value we render, schemas.ts holds the OpenAPI descriptions every
  // API consumer reads, globals.css is user-facing text in a stylesheet, and
  // mqtt-ingester writes the column names. Inserting "dBA" into any of them
  // passed the guard.
  const roots = ["src", "mqtt-ingester", "simulator", "scripts"];

  // Three files say "NOT dB(A)" on purpose — the honesty caveat itself
  // contains the string it warns about. A substring guard cannot tell a claim
  // from its denial, so they are named here rather than silently skipped.
  const DELIBERATE = [
    "src/lib/api/openapi.ts", // the caveat itself: "uncalibrated device-dB, NOT dB(A)"
    "src/lib/api/schemas.ts", // same caveat, on the laeq field description
    "src/lib/api/openapi.test.ts", // asserts the caveat survives
    "src/lib/api/schemas.test.ts", // asserts the caveat survives
    "src/lib/dashboard/no-dba.test.ts", // this file
  ];

  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else if (/\.(tsx?|jsx?|css|json|md)$/.test(entry)) out.push(full);
    }
    return out;
  };

  const files = roots
    .flatMap((r) => walk(resolve(process.cwd(), r)))
    .filter((f) => !DELIBERATE.includes(f.replace(`${process.cwd()}/`, "")));

  it("scans a non-trivial set of files", () => {
    expect(files.length).toBeGreaterThan(80);
  });

  it("the deliberate exceptions still say what they are excepted for", () => {
    // If one of these stops containing the caveat, it should leave the list —
    // an allowlist entry that no longer earns its place is a hole.
    for (const rel of DELIBERATE) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      expect(src, rel).toMatch(/dB\s?\(?A\)?/);
    }
  });

  it.each(files.map((f) => [f.replace(`${process.cwd()}/`, ""), f] as const))(
    "%s does not assert dBA",
    (_name, full) => {
      const src = readFileSync(full, "utf8");
      // Matches dBA, dB(A), dB A — the claim in any spelling.
      //
      // No (?![a-z]) lookahead. It was added to avoid false positives and
      // caught none: it matched zero of the scanned files either way, while
      // silently dropping "dBAs" and "dBAvg" — both plausible interface
      // strings, both caught by the guard this one replaced.
      expect(src).not.toMatch(/dB\s?\(?A\)?/);
    }
  );
});
