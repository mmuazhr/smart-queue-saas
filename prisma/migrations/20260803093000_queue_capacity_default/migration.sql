-- maxConcurrentOrders is now a real checkout gate, not just an ETA input.
-- The old default of 5 would close the queue on any busy stall, so raise it
-- and lift the stores still sitting on the old default.
ALTER TABLE "stores" ALTER COLUMN "max_concurrent_orders" SET DEFAULT 50;
UPDATE "stores" SET "max_concurrent_orders" = 50 WHERE "max_concurrent_orders" = 5;
