-- When Echo announced the unit's installation on Discord. Units installed
-- before this column existed count as announced, so the first deploy does
-- not announce the whole fleet.
ALTER TABLE "sensors" ADD COLUMN "install_announced_at" TIMESTAMPTZ(3);
UPDATE "sensors" SET "install_announced_at" = "installed_at" WHERE "installed_at" IS NOT NULL;
