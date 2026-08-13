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
  const roots = ["src/components/dashboard", "src/lib/strings", "src/app"];

  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else if (/\.(tsx?|json)$/.test(entry) && !entry.endsWith(".test.ts")) out.push(full);
    }
    return out;
  };

  const files = roots.flatMap((r) => walk(resolve(process.cwd(), r)));

  it("scans a non-trivial set of files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((f) => [f.replace(`${process.cwd()}/`, ""), f] as const))(
    "%s does not assert dBA",
    (_name, full) => {
      const src = readFileSync(full, "utf8");
      // Matches dBA, dB(A), dB A — the claim in any spelling.
      expect(src).not.toMatch(/dB\s?\(?A\)?(?![a-z])/);
    }
  );
});
