-- Emergency queue pause: merchants can stop new order creation without
-- touching store status or operating hours. Existing in-flight orders are
-- unaffected; only POST /api/orders checks this flag.
ALTER TABLE "stores" ADD COLUMN "orders_paused" BOOLEAN NOT NULL DEFAULT false;
