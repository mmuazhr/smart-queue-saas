-- Backfill: legacy cash orders lost their "Pay at Counter" prompt.
--
-- Migration 20260801100845_qr_payment_confirmation added `orders.payment_method`
-- with `DEFAULT 'QR'`, which backfilled EVERY pre-existing row — including
-- orders originally placed as cash (recorded on the old `orders.payment_gateway`
-- column as 'CASH') — to 'QR'. Both `isCashPending` and `settlesCash` now read
-- `paymentMethod`, so those in-flight legacy cash orders silently lost the
-- "Pay at Counter" customer prompt and never settle `payment_status` on
-- completion (the CASH settlement branch in PATCH /api/orders/[orderId] never
-- fires for a row that reads as 'QR').
--
-- Idempotent: safe to re-run, only touches rows that still disagree.
UPDATE "orders"
SET "payment_method" = 'CASH'
WHERE "payment_gateway" = 'CASH'
  AND "payment_method" <> 'CASH';
