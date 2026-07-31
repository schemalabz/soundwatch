-- Add a PostGIS geography point for spatial queries, kept in sync with the
-- lat/lng floats (which stay the writable source of truth) via a trigger, plus
-- a GiST index. Requires the postgis extension (migration 0005).
--
-- A trigger is used rather than a GENERATED column because Prisma reads a
-- generated expression as a column DEFAULT and reports perpetual drift.

ALTER TABLE "sensors" ADD COLUMN "location" geography(Point, 4326);

-- Backfill existing rows.
UPDATE "sensors"
SET "location" = ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;

-- Keep `location` in sync whenever coordinates change.
CREATE OR REPLACE FUNCTION sensors_sync_location() RETURNS trigger AS $$
BEGIN
  NEW."location" := CASE
    WHEN NEW."latitude" IS NOT NULL AND NEW."longitude" IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::geography
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sensors_location_sync
  BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "sensors"
  FOR EACH ROW EXECUTE FUNCTION sensors_sync_location();

CREATE INDEX "idx_sensors_location" ON "sensors" USING GIST ("location");
