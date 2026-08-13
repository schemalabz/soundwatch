// Backfill ⇄ ingester parity: a wire payload becomes a readings row via the
// ACTUAL ingester code — parser + the shared deriveReadingRow (row.ts), the
// same function the live ingester calls. Backfilled rows are therefore
// indistinguishable from live-ingested ones by construction.

import { parseSensorPayload } from "../mqtt-ingester/parser";
import { deriveReadingRow, type ReadingRow } from "../mqtt-ingester/row";

export type { ReadingRow };

/**
 * Backfill passes the TRUE instant as receivedAt while the payload's own `t:`
 * carries the device's drifted clock — the same split a live unit produces,
 * where the server stamps arrival and the device stamps its own idea of now.
 */
export function payloadToRow(payload: string, receivedAt: Date): ReadingRow | null {
  const reading = parseSensorPayload(payload);
  if (!reading) return null;
  return deriveReadingRow(reading, receivedAt);
}
