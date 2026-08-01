import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import StoreMenuClient from "./StoreMenuClient";
import { Metadata } from "next";
import { isStoreOpen, nextOpeningTime, type OperatingHoursEntry } from "@/lib/store-hours";
import { openingLabel } from "@/components/customer/ClosedBanner";
import { toPlainMenuItem } from "@/lib/serializers";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await prisma.store.findUnique({
    where: { slug },
    select: { name: true, description: true }
  });

  if (!store) return { title: "Store Not Found" };

  return {
    title: `${store.name} | Order Online`,
    description: store.description || `Order from ${store.name} and skip the queue!`,
  };
}

export default async function StorePage({ params }: Props) {
  const { slug } = await params;

  const store = await prisma.store.findUnique({
    where: { slug },
    include: {
      categories: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          menuItems: {
            where: { isAvailable: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      menuItems: {
        where: { categoryId: null, isAvailable: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!store) {
    notFound();
  }

  if (store.status !== "ACTIVE" && store.status !== "CLOSED") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="glass p-8 rounded-3xl max-w-sm">
          <h1 className="text-2xl font-bold mb-2">Store Unavailable</h1>
          <p className="text-[var(--color-text-muted)]">This store is currently not accepting orders.</p>
        </div>
      </div>
    );
  }

  const hours = store.operatingHours as Record<string, OperatingHoursEntry> | null;
  const isOpen = isStoreOpen(hours);
  const closedLabel = isOpen ? "" : openingLabel(nextOpeningTime(hours));

  // menuItems.price is a Prisma Decimal, which isn't a plain serializable
  // value — passing it straight into a Client Component prop triggers a
  // server/client boundary warning. Convert every menu item the same way
  // toPlainOrder/toPlainOrderItem already do for orders.
  const plainStore = {
    ...store,
    categories: store.categories.map((category) => ({
      ...category,
      menuItems: category.menuItems.map(toPlainMenuItem),
    })),
    menuItems: store.menuItems.map(toPlainMenuItem),
  };

  return (
    <StoreMenuClient
      store={plainStore}
      isOpen={isOpen}
      closedLabel={closedLabel}
      ordersPaused={store.ordersPaused}
    />
  );
}
