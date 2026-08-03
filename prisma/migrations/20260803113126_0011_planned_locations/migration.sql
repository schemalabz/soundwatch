-- AlterTable
ALTER TABLE "sensors" ADD COLUMN     "planned_location_id" TEXT;

-- CreateTable
CREATE TABLE "planned_locations" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "address" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planned_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planned_locations_key_key" ON "planned_locations"("key");

-- AddForeignKey
ALTER TABLE "sensors" ADD CONSTRAINT "sensors_planned_location_id_fkey" FOREIGN KEY ("planned_location_id") REFERENCES "planned_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
