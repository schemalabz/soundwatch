-- SD-path v1: raw framelog chunks, offset-keyed for resumable idempotent pulls.
CREATE TABLE "frame_log_chunks" (
    "id" BIGSERIAL NOT NULL,
    "device_id" TEXT NOT NULL,
    "offset" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "frame_log_chunks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "frame_log_chunks_device_id_offset_key" ON "frame_log_chunks"("device_id", "offset");
