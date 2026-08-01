-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "charge_breakdown" JSONB,
ADD COLUMN     "confirmed_at" TIMESTAMP(3),
ADD COLUMN     "payment_method" TEXT NOT NULL DEFAULT 'QR',
ADD COLUMN     "payment_proof_url" TEXT;

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "charges" JSONB,
ADD COLUMN     "payment_instructions" TEXT,
ADD COLUMN     "payment_qr_url" TEXT;
