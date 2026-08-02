// =============================================================================
// Database Seed — Demo data for development
// =============================================================================

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ---- Clean existing data ----
  await prisma.notification.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.dailyQueueCounter.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.category.deleteMany();
  await prisma.store.deleteMany();
  await prisma.user.deleteMany();

  // ---- Create Admin User ----
  const admin = await prisma.user.create({
    data: {
      email: "admin@smartqueue.my",
      name: "Admin User",
      passwordHash: await bcrypt.hash("admin123", 12),
      role: "ADMIN",
      isVerified: true,
    },
  });
  console.log(`  ✅ Admin: ${admin.email}`);

  // ---- Create Merchant User ----
  const merchant = await prisma.user.create({
    data: {
      email: "merchant@test.my",
      name: "Abang Ali",
      phone: "+60123456789",
      passwordHash: await bcrypt.hash("merchant123", 12),
      role: "MERCHANT",
      isVerified: true,
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  console.log(`  ✅ Merchant: ${merchant.email}`);

  // ---- Create Store ----
  const store = await prisma.store.create({
    data: {
      ownerId: merchant.id,
      name: "Abang Burger",
      slug: "abang-burger",
      description:
        "The best ramly burger in KL! Since 2019, serving fresh handmade burgers with our secret sauce.",
      address: "Jalan Alor, Bukit Bintang, 50200 Kuala Lumpur",
      latitude: 3.1456,
      longitude: 101.7084,
      phone: "+60123456789",
      status: "ACTIVE",
      avgPrepTimeMins: 8,
      maxConcurrentOrders: 4,
      operatingHours: {
        monday: { open: "17:00", close: "23:00", isClosed: false },
        tuesday: { open: "17:00", close: "23:00", isClosed: false },
        wednesday: { open: "17:00", close: "23:00", isClosed: false },
        thursday: { open: "17:00", close: "23:00", isClosed: false },
        friday: { open: "17:00", close: "00:00", isClosed: false },
        saturday: { open: "17:00", close: "00:00", isClosed: false },
        sunday: { open: "17:00", close: "23:00", isClosed: false },
      },
    },
  });
  console.log(`  ✅ Store: ${store.name} (slug: ${store.slug})`);

  // ---- Create Categories ----
  const burgersCat = await prisma.category.create({
    data: { storeId: store.id, name: "Burgers", sortOrder: 0 },
  });
  const drinksCat = await prisma.category.create({
    data: { storeId: store.id, name: "Drinks", sortOrder: 1 },
  });
  const sidesCat = await prisma.category.create({
    data: { storeId: store.id, name: "Sides", sortOrder: 2 },
  });
  console.log(`  ✅ Categories: Burgers, Drinks, Sides`);

  // ---- Create Menu Items ----
  const menuItems = [
    {
      storeId: store.id,
      categoryId: burgersCat.id,
      name: "Ramly Burger Special",
      description: "Double patty with egg, cheese, and our secret sauce",
      price: 8.5,
      isAvailable: true,
      prepTimeMins: 10,
      sortOrder: 0,
    },
    {
      storeId: store.id,
      categoryId: burgersCat.id,
      name: "Chicken Burger",
      description: "Crispy chicken patty with lettuce and mayo",
      price: 6.0,
      isAvailable: true,
      prepTimeMins: 8,
      sortOrder: 1,
    },
    {
      storeId: store.id,
      categoryId: burgersCat.id,
      name: "Burger Oblong",
      description: "Classic oblong-shaped burger with special seasoning",
      price: 7.0,
      isAvailable: true,
      prepTimeMins: 8,
      sortOrder: 2,
    },
    {
      storeId: store.id,
      categoryId: drinksCat.id,
      name: "Teh Tarik",
      description: "Freshly pulled milk tea — the Malaysian classic",
      price: 3.0,
      isAvailable: true,
      prepTimeMins: 3,
      sortOrder: 0,
    },
    {
      storeId: store.id,
      categoryId: drinksCat.id,
      name: "Milo Dinosaur",
      description: "Iced Milo topped with a mountain of Milo powder",
      price: 4.5,
      isAvailable: true,
      prepTimeMins: 3,
      sortOrder: 1,
    },
    {
      storeId: store.id,
      categoryId: sidesCat.id,
      name: "French Fries",
      description: "Crispy golden fries with chilli sauce",
      price: 4.0,
      isAvailable: true,
      prepTimeMins: 5,
      sortOrder: 0,
    },
    {
      storeId: store.id,
      categoryId: sidesCat.id,
      name: "Nuggets (6 pcs)",
      description: "Chicken nuggets with mayo dipping",
      price: 5.0,
      isAvailable: false, // Sold out for testing
      prepTimeMins: 5,
      sortOrder: 1,
    },
  ];


  for (const item of menuItems) {
    await prisma.menuItem.create({ data: item });
  }
  console.log(`  ✅ Menu items: ${menuItems.length} items created`);

  // ---- Create Daily Queue Counter ----
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.dailyQueueCounter.create({
    data: {
      storeId: store.id,
      queueDate: today,
      lastQueueNumber: 0,
    },
  });
  console.log(`  ✅ Queue counter initialized for today`);

  console.log("\n🎉 Seed completed successfully!");
  console.log(`\n📋 Login credentials:`);
  console.log(`   Admin:    admin@smartqueue.my / admin123`);
  console.log(`   Merchant: merchant@test.my / merchant123`);
  console.log(`   Store:    /store/abang-burger\n`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
