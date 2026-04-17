-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MERCHANT',
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logo_url" TEXT,
    "banner_url" TEXT,
    "address" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "avg_prep_time_mins" INTEGER NOT NULL DEFAULT 10,
    "max_concurrent_orders" INTEGER NOT NULL DEFAULT 5,
    "operating_hours" JSONB,
    "qr_code_url" TEXT,
    "payment_gateway" TEXT,
    "gateway_merchant_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "stores_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "categories_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "store_id" TEXT NOT NULL,
    "category_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" REAL NOT NULL,
    "image_url" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "prep_time_mins" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "menu_items_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "store_id" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "queue_number" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "subtotal" REAL NOT NULL,
    "tax" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL,
    "estimated_wait_mins" INTEGER,
    "payment_intent_id" TEXT,
    "payment_gateway" TEXT,
    "payment_status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "paid_at" DATETIME,
    "accepted_at" DATETIME,
    "preparing_at" DATETIME,
    "ready_at" DATETIME,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "order_id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "item_price" REAL NOT NULL,
    "quantity" INTEGER NOT NULL,
    "line_total" REAL NOT NULL,
    "special_instructions" TEXT,
    CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "order_id" TEXT NOT NULL,
    "recipient_phone" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message_body" TEXT NOT NULL,
    "external_id" TEXT,
    "sent_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "daily_queue_counters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "store_id" TEXT NOT NULL,
    "queue_date" DATETIME NOT NULL,
    "last_queue_number" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "daily_queue_counters_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "stores_slug_key" ON "stores"("slug");

-- CreateIndex
CREATE INDEX "stores_owner_id_idx" ON "stores"("owner_id");

-- CreateIndex
CREATE INDEX "categories_store_id_idx" ON "categories"("store_id");

-- CreateIndex
CREATE INDEX "menu_items_store_id_idx" ON "menu_items"("store_id");

-- CreateIndex
CREATE INDEX "menu_items_category_id_idx" ON "menu_items"("category_id");

-- CreateIndex
CREATE INDEX "orders_store_id_idx" ON "orders"("store_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_customer_phone_idx" ON "orders"("customer_phone");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "notifications_order_id_idx" ON "notifications"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_queue_counters_store_id_queue_date_key" ON "daily_queue_counters"("store_id", "queue_date");
