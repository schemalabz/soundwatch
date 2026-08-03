-- Config-ghost tripwire: refused blanking ESP syncs (field 8 of id 243).
ALTER TABLE "readings" ADD COLUMN "ghost_refusals" INTEGER;
