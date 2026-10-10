-- One open incident per (unit, kind), enforced by the database; and the
-- is_active value to restore when a retirement is undone.

ALTER TABLE "sensors" ADD COLUMN "active_before_retire" BOOLEAN;

-- true while open, NULL once closed: NULLs never collide, so the unique
-- index below admits any number of closed incidents and one open one.
ALTER TABLE "incidents" ADD COLUMN "open_slot" BOOLEAN DEFAULT true;
UPDATE "incidents" SET "open_slot" = NULL WHERE "closed_at" IS NOT NULL;
CREATE UNIQUE INDEX "incidents_one_open" ON "incidents"("sensor_id", "kind", "open_slot");

-- Closing an incident frees its slot. Held by the database, so a close from
-- anywhere (SQL, a future route) cannot leave a unit unable to alert again.
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_open_slot_matches_closed"
  CHECK ((closed_at IS NULL) = (open_slot IS TRUE));

-- A retired token is never public.
ALTER TABLE "sensors" ADD CONSTRAINT "sensors_retired_not_public"
  CHECK (retired_at IS NULL OR NOT is_active);
