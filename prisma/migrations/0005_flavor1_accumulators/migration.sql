-- Flavor 1 (Step 4): continuous-LAeq accumulators + server-computed levels.
-- Raw device accumulators (energy_sum/frame_count/interval_s/max_energy/min_energy,
-- payload_version) plus laeq / realized_duty / lmax_est / lmin_est computed by the
-- ingester. All nullable — only Flavor 1 firmware populates them.
ALTER TABLE "readings"
  ADD COLUMN "payload_version" INTEGER,
  ADD COLUMN "energy_sum" DOUBLE PRECISION,
  ADD COLUMN "frame_count" INTEGER,
  ADD COLUMN "interval_s" INTEGER,
  ADD COLUMN "max_energy" DOUBLE PRECISION,
  ADD COLUMN "min_energy" DOUBLE PRECISION,
  ADD COLUMN "laeq" DOUBLE PRECISION,
  ADD COLUMN "realized_duty" DOUBLE PRECISION,
  ADD COLUMN "lmax_est" DOUBLE PRECISION,
  ADD COLUMN "lmin_est" DOUBLE PRECISION;
