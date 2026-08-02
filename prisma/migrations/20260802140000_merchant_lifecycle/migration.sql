-- AlterTable
ALTER TABLE "users" ADD COLUMN     "frozen_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "suspended_at" TIMESTAMP(3);
