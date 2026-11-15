-- Device clock correction (issue #12).
--
-- corrected_at: recorded_at minus the device clock error the ingester
-- estimated from prompt rows (src/lib/fleet/clockOffset.ts). NULL = no
-- estimate; readers fall back to recorded_at.
--
-- corrected_hour_shift: hours between the hour corrected_at falls in and the
-- hour recorded_at falls in (-1, 0 or +1). Redundant with corrected_at, and
-- here only because readings_hour_bins must group on a plain column: a
-- continuous aggregate may hold a single time_bucket, and it must be on the
-- partition column (recorded_at).
--
-- Both are metadata-only additions (nullable / constant default): no table
-- rewrite. Historical rows are filled by scripts/backfill-corrected-at.ts.
ALTER TABLE "readings" ADD COLUMN "corrected_at" TIMESTAMPTZ(3);
ALTER TABLE "readings" ADD COLUMN "corrected_hour_shift" SMALLINT NOT NULL DEFAULT 0;
