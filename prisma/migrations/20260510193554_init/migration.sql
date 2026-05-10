-- CreateTable
CREATE TABLE "sensors" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "name" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "address" TEXT,
    "firmware_version" TEXT,
    "reading_interval_s" INTEGER NOT NULL DEFAULT 60,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "readings" (
    "id" BIGSERIAL NOT NULL,
    "sensor_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "noise_dba" DOUBLE PRECISION,
    "temperature" DOUBLE PRECISION,
    "humidity" DOUBLE PRECISION,
    "light_lux" DOUBLE PRECISION,
    "pressure_pa" DOUBLE PRECISION,
    "uv_index" DOUBLE PRECISION,
    "pm1" DOUBLE PRECISION,
    "pm25" DOUBLE PRECISION,
    "pm4" DOUBLE PRECISION,
    "pm10" DOUBLE PRECISION,

    CONSTRAINT "readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sensors_device_id_key" ON "sensors"("device_id");

-- CreateIndex
CREATE INDEX "idx_readings_sensor_time" ON "readings"("sensor_id", "recorded_at" DESC);

-- AddForeignKey
ALTER TABLE "readings" ADD CONSTRAINT "readings_sensor_id_fkey" FOREIGN KEY ("sensor_id") REFERENCES "sensors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
