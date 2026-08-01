import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import CheckoutClient from "./CheckoutClient";
import ClosedBanner, { openingLabel } from "@/components/customer/ClosedBanner";
import { isStoreOpen, nextOpeningTime, type OperatingHoursEntry } from "@/lib/store-hours";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function CheckoutPage({ params }: Props) {
  const { slug } = await params;

  const store = await prisma.store.findUnique({
    where: { slug },
    select: { operatingHours: true, charges: true },
  });

  if (!store) {
    notFound();
  }

  const hours = store.operatingHours as Record<string, OperatingHoursEntry> | null;

  // Direct-URL guard: the cart may have been filled while the store was open.
  if (!isStoreOpen(hours)) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] px-6 py-8 flex flex-col items-center justify-center gap-6 text-center">
        <div className="w-full max-w-sm">
          <ClosedBanner label={openingLabel(nextOpeningTime(hours))} />
        </div>
        <Link
          href={`/store/${slug}`}
          className="flex items-center gap-2 text-sm font-bold text-[var(--color-primary)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to the menu
        </Link>
      </div>
    );
  }

  return <CheckoutClient charges={store.charges} />;
}
