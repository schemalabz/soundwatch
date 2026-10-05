-- Dated notes per unit: what we learned from outside the data.

-- CreateTable
CREATE TABLE "unit_notes" (
    "id" BIGSERIAL NOT NULL,
    "sensor_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "unit_notes_sensor_id_created_at_idx" ON "unit_notes"("sensor_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "unit_notes" ADD CONSTRAINT "unit_notes_sensor_id_fkey" FOREIGN KEY ("sensor_id") REFERENCES "sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

