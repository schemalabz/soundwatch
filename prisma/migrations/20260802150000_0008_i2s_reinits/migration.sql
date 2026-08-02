-- Approach A instrumentation: cumulative mid-interval I2S recoveries (7th field
-- of the packed id-243 diagnostics). Null for firmware older than the A build.
ALTER TABLE "readings" ADD COLUMN "i2s_reinits" INTEGER;
