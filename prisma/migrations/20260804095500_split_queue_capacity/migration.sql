-- Split the two meanings maxConcurrentOrders had been carrying: the ETA math
-- wants "orders cooked in parallel" (back to a default of 5), the checkout gate
-- wants "orders the queue will hold" (the new max_active_orders, default 50).
-- Only stores still sitting on the repurposed 50 are lifted back — a merchant
-- who set their own value keeps it.
ALTER TABLE "stores" ADD COLUMN "max_active_orders" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "stores" ALTER COLUMN "max_concurrent_orders" SET DEFAULT 5;
UPDATE "stores" SET "max_concurrent_orders" = 5 WHERE "max_concurrent_orders" = 50;
