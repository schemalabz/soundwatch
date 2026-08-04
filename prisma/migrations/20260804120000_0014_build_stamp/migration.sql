-- Release 1.0 build stamp: fields 9-11 of id 243. Which firmware produced this
-- row, for both chips. "sam_git_hash <> esp_git_hash" finds a mismatched SAM/ESP
-- pair fleet-wide; a trailing "+" on a hash means that image was built from a
-- modified tree and does not reproduce from the commit it names.
ALTER TABLE "readings" ADD COLUMN "soundwatch_release" TEXT;
ALTER TABLE "readings" ADD COLUMN "sam_git_hash" TEXT;
ALTER TABLE "readings" ADD COLUMN "esp_git_hash" TEXT;
