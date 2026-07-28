-- Add server-side ingestion timestamp.
-- recorded_at = device clock (when the sound happened; may be old on a
-- store-and-forward replay). received_at = when the ingester persisted the row,
-- so a buffered-backlog replay is distinguishable from live data.
-- NOT NULL with a default backfills existing rows with the migration time.
ALTER TABLE "readings" ADD COLUMN "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
