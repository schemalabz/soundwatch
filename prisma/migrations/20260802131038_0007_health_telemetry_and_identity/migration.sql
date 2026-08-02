-- AlterTable
ALTER TABLE "readings" ADD COLUMN     "capture_fails" INTEGER,
ADD COLUMN     "device_uptime_s" INTEGER,
ADD COLUMN     "free_heap_bytes" INTEGER,
ADD COLUMN     "publish_fails" INTEGER,
ADD COLUMN     "reset_cause" INTEGER,
ADD COLUMN     "wifi_connects" INTEGER;

-- AlterTable
ALTER TABLE "sensors" ADD COLUMN     "hardware_id" TEXT,
ADD COLUMN     "is_experimental" BOOLEAN NOT NULL DEFAULT false;
