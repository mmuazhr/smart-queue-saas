import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import StoreMenuClient from "./StoreMenuClient";
import { Metadata } from "next";

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

  return <StoreMenuClient store={store} />;
}
