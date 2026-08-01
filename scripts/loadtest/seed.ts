// =============================================================================
// Load-test seed — 2 merchants, 2 active stores, full order boards
// =============================================================================
// Standalone from prisma/seed.ts (dev demo data): this seeds a large, realistic
// board for capacity testing. Point DATABASE_URL at the dedicated
// `queless_loadtest` database before running — never the shared dev DB.
//
// Schema note: Store.ownerId is @unique (one store per merchant — "the
// dashboard reads stores[0] everywhere", see prisma/schema.prisma). The task
// asked for "one merchant user, TWO active stores", which the schema cannot
// express, so this creates two merchant users, one store each.

import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ORDERS_PER_STORE = 100;
const STATUSES = ["AWAITING_CONFIRMATION", "PAID", "PREPARING", "READY"] as const;

const MENU_TEMPLATE = [
  { name: "Ramly Burger Special", price: 8.5 },
  { name: "Chicken Burger", price: 6.0 },
  { name: "Burger Oblong", price: 7.0 },
  { name: "Teh Tarik", price: 3.0 },
  { name: "Milo Dinosaur", price: 4.5 },
  { name: "French Fries", price: 5.0 },
  { name: "Nasi Lemak", price: 6.5 },
  { name: "Iced Lemon Tea", price: 3.5 },
];

function randomPhone(): string {
  const n = Math.floor(10000000 + Math.random() * 89999999);
  return `+601${n}`;
}

async function seedStore(ownerEmail: string, ownerName: string, storeName: string, slug: string) {
  const owner = await prisma.user.create({
    data: {
      email: ownerEmail,
      name: ownerName,
      phone: randomPhone(),
      passwordHash: await bcrypt.hash("loadtest123", 12),
      role: "MERCHANT",
      isVerified: true,
    },
  });

  const store = await prisma.store.create({
    data: {
      ownerId: owner.id,
      name: storeName,
      slug,
      description: `${storeName} — load-test fixture store`,
      status: "ACTIVE",
      ordersPaused: false,
      avgPrepTimeMins: 8,
      maxConcurrentOrders: 5,
      // null = always open, so isStoreOpen() never gates the burst test.
      operatingHours: undefined,
    },
  });

  // Sequential, not Promise.all: this local `prisma dev` daemon is shared
  // with many other agents right now and is fragile under concurrency —
  // seeding is a one-time setup cost, not part of the measured load, so
  // there is no reason to add contention here.
  const menuItems: Awaited<ReturnType<typeof prisma.menuItem.create>>[] = [];
  for (const [i, item] of MENU_TEMPLATE.entries()) {
    menuItems.push(
      await prisma.menuItem.create({
        data: {
          storeId: store.id,
          name: item.name,
          description: `${item.name} — load-test item`,
          price: new Prisma.Decimal(item.price.toFixed(2)),
          isAvailable: true,
          prepTimeMins: 8,
          sortOrder: i,
        },
      })
    );
  }

  console.log(`  store ${store.name} (${store.id}) owner=${owner.email} menuItems=${menuItems.length}`);

  const orderIds: string[] = [];

  // Seed ~100 orders per store, spread across the "active board" statuses,
  // each with 1-3 order items. Sequential creation (not the API) — this is
  // fixture setup, not part of the measured load.
  for (let i = 0; i < ORDERS_PER_STORE; i++) {
    const status = STATUSES[i % STATUSES.length];
    const itemCount = 1 + (i % 3);
    const chosenItems = Array.from({ length: itemCount }, (_, k) => menuItems[(i + k) % menuItems.length]);

    let subtotalCents = 0;
    const orderItemsData = chosenItems.map((mi) => {
      const quantity = 1 + (i % 2);
      const priceCents = Math.round(Number(mi.price) * 100);
      const lineCents = priceCents * quantity;
      subtotalCents += lineCents;
      return {
        menuItemId: mi.id,
        itemName: mi.name,
        itemPrice: new Prisma.Decimal((priceCents / 100).toFixed(2)),
        quantity,
        lineTotal: new Prisma.Decimal((lineCents / 100).toFixed(2)),
        specialInstructions: null,
      };
    });

    const total = new Prisma.Decimal((subtotalCents / 100).toFixed(2));
    const now = new Date();
    const timestamps: Record<string, Date> = {};
    if (status !== "AWAITING_CONFIRMATION") {
      timestamps.paidAt = now;
      timestamps.confirmedAt = now;
    }
    if (status === "PREPARING" || status === "READY") timestamps.acceptedAt = now;
    if (status === "PREPARING" || status === "READY") timestamps.preparingAt = now;
    if (status === "READY") timestamps.readyAt = now;

    const order = await prisma.order.create({
      data: {
        storeId: store.id,
        customerPhone: randomPhone(),
        customerName: `Load Test Customer ${i}`,
        queueNumber: status === "AWAITING_CONFIRMATION" ? null : i + 1,
        status,
        subtotal: total,
        tax: new Prisma.Decimal("0.00"),
        total,
        paymentMethod: "QR",
        paymentStatus: status === "AWAITING_CONFIRMATION" ? "PENDING" : "PAID",
        orderItems: { create: orderItemsData },
        ...timestamps,
      },
      select: { id: true },
    });
    orderIds.push(order.id);
  }

  console.log(`  ✅ ${ORDERS_PER_STORE} orders seeded for ${store.name}`);
  return { owner, store, menuItems, orderIds };
}

async function main() {
  console.log("Seeding load-test database (queless_loadtest)...");

  // Wipe in FK-safe order — this is the isolated queless_loadtest DB only.
  await prisma.notification.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.dailyQueueCounter.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.category.deleteMany();
  await prisma.store.deleteMany();
  await prisma.user.deleteMany();

  const result1 = await seedStore(
    "merchant1@loadtest.my",
    "Loadtest Merchant One",
    "Loadtest Store One",
    "loadtest-store-one"
  );
  const result2 = await seedStore(
    "merchant2@loadtest.my",
    "Loadtest Merchant Two",
    "Loadtest Store Two",
    "loadtest-store-two"
  );

  const summary = {
    stores: [
      { id: result1.store.id, ownerEmail: result1.owner.email, password: "loadtest123" },
      { id: result2.store.id, ownerEmail: result2.owner.email, password: "loadtest123" },
    ],
    menuItemIds: {
      [result1.store.id]: result1.menuItems.map((m) => m.id),
      [result2.store.id]: result2.menuItems.map((m) => m.id),
    },
    orderIds: {
      [result1.store.id]: result1.orderIds,
      [result2.store.id]: result2.orderIds,
    },
  };

  // Write fixture IDs so the load scripts don't need to re-query them.
  const fs = await import("fs");
  fs.writeFileSync(
    new URL("./fixture.json", import.meta.url),
    JSON.stringify(summary, null, 2)
  );

  console.log("Seed complete. Fixture written to scripts/loadtest/fixture.json");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
