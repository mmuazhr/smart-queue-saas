-- Backfill: normalize existing category and menu item names to Title Case.
--
-- New create/update paths now Title Case category and menu item names
-- server-side (see src/lib/format.ts), but pre-existing rows typed in
-- as-is (e.g. "fried rice", "nasi GORENG cina") are left as they were.
-- INITCAP implements the same "first letter of each word up, rest down"
-- rule and is idempotent, so it's safe to re-run.
UPDATE "categories"
SET "name" = INITCAP("name")
WHERE "name" <> INITCAP("name");

UPDATE "menu_items"
SET "name" = INITCAP("name")
WHERE "name" <> INITCAP("name");
