-- Daily framelog rotation: chunks are now keyed (device, day, offset), where
-- day '' is the legacy single-file namespace. Also heads off int4 offset
-- overflow (~2.1GB at ~day 330 of a single growing file).
ALTER TABLE "frame_log_chunks" ADD COLUMN "day" TEXT NOT NULL DEFAULT '';
DROP INDEX "frame_log_chunks_device_id_offset_key";
CREATE UNIQUE INDEX "frame_log_chunks_device_id_day_offset_key"
  ON "frame_log_chunks"("device_id", "day", "offset");
