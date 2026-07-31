import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import FindOrderClient from "./FindOrderClient";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function FindOrderPage({ params }: Props) {
  const { slug } = await params;

  // The cart holds storeId for checkout, but a customer arriving here has no
  // cart — resolve the store from the slug on the server instead.
  const store = await prisma.store.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });

  if (!store) {
    notFound();
  }

  return <FindOrderClient slug={slug} storeId={store.id} storeName={store.name} />;
}
