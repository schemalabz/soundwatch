-- Flavor 2: level-histogram percentiles + third-octave bands.
-- Raw packed strings kept for reprocessing; l10/l50/l90 + bands_db computed by
-- the ingester. All nullable — only Flavor 2 firmware populates them.
ALTER TABLE "readings"
  ADD COLUMN "hist_raw" TEXT,
  ADD COLUMN "bands_raw" TEXT,
  ADD COLUMN "l10" DOUBLE PRECISION,
  ADD COLUMN "l50" DOUBLE PRECISION,
  ADD COLUMN "l90" DOUBLE PRECISION,
  ADD COLUMN "bands_db" JSONB;
