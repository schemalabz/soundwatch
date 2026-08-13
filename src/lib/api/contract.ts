/* eslint-disable @typescript-eslint/no-unused-vars --
   The _-prefixed types below are compile-time assertions. They are "unused" by
   design: their only job is to fail tsc when the API drifts from the database. */
import type { Prisma } from "@prisma/client";
import type { ReadingRow } from "./readings";
import type { ReadingRow as IngestRow } from "../../../mqtt-ingester/row";
import { COLUMNS } from "../../../simulator/backfill";
import { READING_COLUMNS } from "@/app/api/sensors/route";
import type { ApiReading } from "./schemas";

/**
 * Compile-time guards binding the API surface to the database.
 *
 * Everything downstream of ReadingSchema is derived — ApiReading via z.infer,
 * the OpenAPI document via z.toJSONSchema, the frontend types by importing
 * those. The one seam a human writes twice is the database column list against
 * the zod schema, so that seam is asserted here rather than trusted.
 *
 * These are types only; nothing is emitted. A drift shows up as a tsc error
 * naming the offending field, not as a field silently missing from the API and
 * from the docs.
 */

type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

/**
 * Resolves to true when the union is empty, otherwise to an object carrying
 * the offending field names — so the tsc error reads
 * `{ ERROR: "...how to fix..."; offendingFields: "humidity" }` instead of
 * `Type 'false' does not satisfy the constraint 'true'`.
 */
type NoneLeft<T, Msg extends string> = [T] extends [never]
  ? true
  : { ERROR: Msg; offendingFields: T };

/** Computed by serializeReading from hist_raw; not columns. */
type Derived = "hist" | "topBinCensored" | "bottomBinCensored";
/** Columns whose type deliberately changes at the boundary. */
type Transformed =
  | "recordedAt" // Date -> ISO string
  | "receivedAt" // Date -> ISO string
  | "bandsDb"; // Prisma Json -> (number | null)[]
/** The column that exists only to produce the Derived fields above. */
type DerivationSource = "histRaw";

type PassThrough = Exclude<keyof ApiReading, Derived | Transformed>;

// 1. Every exposed field is a real selected column (no phantom API fields).
type _NoPhantomFields = Expect<
  NoneLeft<
    Exclude<PassThrough, keyof ReadingRow>,
    "This field is in ReadingSchema but is not a column in READING_SELECT. Add it to READING_SELECT, or to Derived/Transformed if it is computed."
  >
>;

// 2. Every selected column is exposed, transformed, or a documented
//    derivation source — so the query cannot quietly fetch what it never
//    returns, and a newly exposed column cannot be forgotten in the schema.
type _NoUnusedColumns = Expect<
  NoneLeft<
    Exclude<keyof ReadingRow, PassThrough | Transformed | DerivationSource>,
    "This column is selected by READING_SELECT but never reaches the API. Expose it in ReadingSchema + serializeReading, or stop selecting it."
  >
>;

// 3. Pass-through fields carry the identical type on both sides, so a column
//    that becomes nullable in the database cannot keep claiming non-null here.
type Mismatched = {
  [K in PassThrough & keyof ReadingRow]: Equals<
    ApiReading[K],
    ReadingRow[K]
  > extends true
    ? never
    : K;
}[PassThrough & keyof ReadingRow];

type _TypesAgree = Expect<
  NoneLeft<
    Mismatched,
    "This field's type in ReadingSchema no longer matches the database column. Update the zod type to match Prisma (usually nullability)."
  >
>;

/* ---------------------------------------------------------------------------
 * The merge introduced two more seams. Both are asserted from here, so neither
 * file has to carry a guard of its own and neither can drift unnoticed.
 * ------------------------------------------------------------------------- */

/**
 * mqtt-ingester/row.ts spells its row out by hand — it is the WRITE surface,
 * and Prisma cannot infer it from a select. Every field it claims must still be
 * a real column, with the type the database actually has. A field renamed in
 * schema.prisma fails here rather than inserting NULL forever.
 */
type WritableColumn = Exclude<
  keyof Prisma.ReadingUncheckedCreateInput,
  "id" | "sensorId"
>;

type PhantomWriteFields = Exclude<keyof IngestRow, WritableColumn>;

type _IngestRowIsAllRealColumns = Expect<
  NoneLeft<
    PhantomWriteFields,
    "mqtt-ingester/row.ts declares a field that is not a column on Reading. Rename it to match schema.prisma, or remove it."
  >
>;

/**
 * Two camelCase-to-snake_case maps now exist: READING_COLUMNS (read path, in
 * the sensors route) and COLUMNS (write path, in the simulator backfill). Where
 * they name the same field they must choose the same column, or a reading
 * written under one name is read under another.
 */
type BackfillField = (typeof COLUMNS)[number]["field"];
type SharedField = Extract<keyof typeof READING_COLUMNS, BackfillField>;

type ColumnDisagreements = {
  [K in SharedField]: (typeof READING_COLUMNS)[K] extends Extract<
    (typeof COLUMNS)[number],
    { field: K }
  >["col"]
    ? never
    : K;
}[SharedField];

type _ColumnMapsAgree = Expect<
  NoneLeft<
    ColumnDisagreements,
    "The read map (sensors route READING_COLUMNS) and the write map (simulator COLUMNS) give this field two different column names. Make them match."
  >
>;
