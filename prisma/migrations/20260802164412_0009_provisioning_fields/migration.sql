-- AlterTable
ALTER TABLE "sensors" ADD COLUMN     "ap_name" TEXT,
ADD COLUMN     "installed_at" TIMESTAMP(3),
ADD COLUMN     "provisioned_at" TIMESTAMP(3);
