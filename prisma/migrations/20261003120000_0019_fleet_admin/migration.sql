-- Fleet admin: retire/supersede tokens, hand-over stage, device events,
-- IP lookups, incidents. See docs/superpowers/specs/2026-10-03-admin-redesign-design.md.
--
-- Nothing here touches readings. The health rollup over readings is a
-- continuous aggregate and lives in scripts/timescale-objects.ts (Timescale
-- refuses to create one inside Prisma's migration transaction).

-- AlterTable
ALTER TABLE "sensors" ADD COLUMN     "handed_over_at" TIMESTAMPTZ(3),
ADD COLUMN     "retired_at" TIMESTAMPTZ(3),
ADD COLUMN     "superseded_by_id" TEXT;

-- CreateTable
CREATE TABLE "device_events" (
    "id" BIGSERIAL NOT NULL,
    "sensor_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "detail" JSONB,
    "source" TEXT NOT NULL,

    CONSTRAINT "device_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_info" (
    "ip" TEXT NOT NULL,
    "ptr" TEXT,
    "network" TEXT,
    "looked_up_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ip_info_pkey" PRIMARY KEY ("ip")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" BIGSERIAL NOT NULL,
    "sensor_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL,
    "closed_at" TIMESTAMPTZ(3),
    "cause" TEXT,
    "evidence" JSONB,
    "notified_at" TIMESTAMPTZ(3),
    "resolved_notified_at" TIMESTAMPTZ(3),

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "device_events_sensor_id_at_idx" ON "device_events"("sensor_id", "at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "device_events_sensor_id_kind_at_key" ON "device_events"("sensor_id", "kind", "at");

-- CreateIndex
CREATE INDEX "incidents_sensor_id_kind_closed_at_idx" ON "incidents"("sensor_id", "kind", "closed_at");

-- CreateIndex
CREATE INDEX "incidents_opened_at_idx" ON "incidents"("opened_at" DESC);

-- AddForeignKey
ALTER TABLE "sensors" ADD CONSTRAINT "sensors_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "sensors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_events" ADD CONSTRAINT "device_events_sensor_id_fkey" FOREIGN KEY ("sensor_id") REFERENCES "sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_sensor_id_fkey" FOREIGN KEY ("sensor_id") REFERENCES "sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

