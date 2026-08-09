import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { COLUMNS } from "./backfill";

// The COLUMNS table hand-maps ReadingRow fields to database column names for
// the raw bulk insert. A compile-time check in backfill.ts guarantees every
// ReadingRow field is covered; this test closes the remaining drift hole —
// column NAMES and the set of scalar columns must match the Prisma schema
// (including @map renames), or the insert would fail or hit wrong columns.

describe("backfill column mapping vs prisma schema", () => {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "Reading")!;
  const schemaCols = new Map(
    model.fields
      .filter((f) => f.kind === "scalar")
      .map((f) => [f.dbName ?? f.name, f])
  );

  it("every COLUMNS entry names a real database column", () => {
    for (const c of COLUMNS) {
      expect(schemaCols.has(c.col), `column "${c.col}" not in schema`).toBe(true);
    }
  });

  it("covers every schema column except the autoincrement id", () => {
    const covered = new Set<string>(COLUMNS.map((c) => c.col));
    for (const [dbName, field] of schemaCols) {
      if (field.hasDefaultValue && field.isId) continue; // BigInt id
      expect(covered.has(dbName), `schema column "${dbName}" missing from COLUMNS`).toBe(true);
    }
  });
});
