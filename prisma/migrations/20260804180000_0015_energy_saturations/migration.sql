-- Field 12 of id 243. Times the device's energy accumulator clamped at its
-- ceiling rather than wrapping (a wrapped int64 would report SILENCE at the
-- loudest moment captured). Non-zero means that interval's LAeq is a lower
-- bound. Null on firmware older than the level-linearity fix.
ALTER TABLE "readings" ADD COLUMN "energy_saturations" INTEGER;
