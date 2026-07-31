-- One store per merchant: the dashboard reads stores[0] everywhere, and the
-- application-level guard has a check-then-act race under concurrent submits.
DROP INDEX IF EXISTS "stores_owner_id_idx";

CREATE UNIQUE INDEX "stores_owner_id_key" ON "stores"("owner_id");
