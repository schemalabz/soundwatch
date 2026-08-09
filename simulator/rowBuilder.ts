// Backfill ⇄ ingester parity: a wire payload becomes a readings row via the
// ACTUAL ingester code — parser + the shared deriveReadingRow (row.ts), the
// same function the live ingester calls. Backfilled rows are therefore
// indistinguishable from live-ingested ones by construction.

import { parseSensorPayload } from "../mqtt-ingester/parser";
import { deriveReadingRow, type ReadingRow } from "../mqtt-ingester/row";

export type { ReadingRow };

/**
 * Backfill passes receivedAt = recordedAt: the row represents a reading that
 * WAS received live at the time it was recorded.
 */
export function payloadToRow(payload: string, receivedAt: Date): ReadingRow | null {
  const reading = parseSensorPayload(payload);
  if (!reading) return null;
  return deriveReadingRow(reading, receivedAt);
}
