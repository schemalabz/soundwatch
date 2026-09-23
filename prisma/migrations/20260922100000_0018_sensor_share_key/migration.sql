-- Per-sensor read-only share key for the live page (/sensors/[id]?k=...).
-- Nullable: most sensors never get one. Unique: a key must resolve to exactly
-- one sensor, and the gate compares it against the sensor the URL names.
ALTER TABLE "sensors" ADD COLUMN "share_key" TEXT;
CREATE UNIQUE INDEX "sensors_share_key_key" ON "sensors" ("share_key");
