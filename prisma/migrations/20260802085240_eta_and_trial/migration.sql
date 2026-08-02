-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "estimated_ready_at" TIMESTAMP(3),
ADD COLUMN     "eta_adjust_mins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "delay_reason" TEXT;

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "queue_delay_mins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "queue_delay_reason" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "trial_ends_at" TIMESTAMP(3),
ADD COLUMN     "early_bird" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "avatar_url" TEXT;

-- Existing merchants predate manual approval; grandfather them in so the
-- pending-approval gate does not lock out accounts that are already live.
UPDATE "users" SET "is_verified" = true WHERE "role" = 'MERCHANT';
