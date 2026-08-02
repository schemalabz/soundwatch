-- Payload v3: exact interval in ms (v2 truncated to whole seconds).
ALTER TABLE "readings" ADD COLUMN "interval_ms" INTEGER;
