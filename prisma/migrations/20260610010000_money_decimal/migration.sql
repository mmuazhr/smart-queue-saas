-- AlterTable: menu_items.price Float → Decimal(10,2)
ALTER TABLE "menu_items" ALTER COLUMN "price" TYPE DECIMAL(10,2) USING "price"::DECIMAL(10,2);

-- AlterTable: orders subtotal/tax/total Float → Decimal(10,2)
ALTER TABLE "orders" ALTER COLUMN "subtotal" TYPE DECIMAL(10,2) USING "subtotal"::DECIMAL(10,2);
ALTER TABLE "orders" ALTER COLUMN "tax"      TYPE DECIMAL(10,2) USING "tax"::DECIMAL(10,2);
ALTER TABLE "orders" ALTER COLUMN "total"    TYPE DECIMAL(10,2) USING "total"::DECIMAL(10,2);

-- AlterTable: order_items itemPrice/lineTotal Float → Decimal(10,2)
ALTER TABLE "order_items" ALTER COLUMN "item_price" TYPE DECIMAL(10,2) USING "item_price"::DECIMAL(10,2);
ALTER TABLE "order_items" ALTER COLUMN "line_total"  TYPE DECIMAL(10,2) USING "line_total"::DECIMAL(10,2);
