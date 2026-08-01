"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Phone, Search, Loader2, Receipt, ChevronRight } from "lucide-react";
import { formatPrice, displayOrderStatus } from "@/lib/utils";

interface FoundOrder {
  id: string;
  queueNumber: number | null;
  status: string;
  total: number;
  createdAt: string;
}

interface FindOrderClientProps {
  slug: string;
  storeId: string;
  storeName: string;
}

export default function FindOrderClient({ slug, storeId, storeName }: FindOrderClientProps) {
  const [phone, setPhone] = useState("");
  const [orders, setOrders] = useState<FoundOrder[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSearching) return;

    setIsSearching(true);
    setError(null);
    setOrders(null);

    // Checkout stores phones as +60XXXXXXXXX — normalise identically or the
    // lookup's exact match never hits.
    const normalised = phone.startsWith("+") ? phone : `+60${phone.replace(/^0/, "")}`;

    try {
      const res = await fetch(
        `/api/orders/lookup?storeId=${encodeURIComponent(storeId)}&phone=${encodeURIComponent(normalised)}`
      );

      if (res.status === 429) {
        setError("Too many attempts — wait a minute.");
        return;
      }

      const data = await res.json();
      if (data.success) setOrders(data.data);
      else setError(data.error || "Could not look up your orders.");
    } catch {
      setError("Something went wrong. Check your connection.");
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] pb-12 animate-fade-in">
      <div className="sticky top-0 z-50 bg-[var(--color-bg)]/80 backdrop-blur-xl border-b border-[var(--color-border)] px-6 py-4 flex items-center gap-4">
        <Link href={`/store/${slug}`} className="p-2 -ml-2 hover:bg-[var(--color-bg-tertiary)] rounded-full transition-all">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-black">Find My Order</h1>
      </div>

      <div className="max-w-md mx-auto px-6 py-8 space-y-8">
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          Enter the phone number you used to order at{" "}
          <span className="font-bold text-[var(--color-text)]">{storeName}</span> and we&apos;ll pull up today&apos;s orders.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-text-secondary)] ml-1">Phone Number (Malaysia)</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
              <div className="absolute left-10 top-1/2 -translate-y-1/2 text-sm font-bold text-[var(--color-text-muted)] border-r border-[var(--color-border)] pr-2">+60</div>
              <input required type="tel" placeholder="123456789" value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-xl pl-20 pr-4 py-3 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none transition-all" />
            </div>
          </div>

          <button type="submit" disabled={isSearching}
            className="w-full py-4 rounded-2xl gradient-primary text-white font-black tracking-widest uppercase text-sm shadow-2xl shadow-orange-500/40 hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50">
            {isSearching ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Search className="h-4 w-4" /> Find My Orders</>}
          </button>
        </form>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">
            {error}
          </div>
        )}

        {orders !== null && orders.length === 0 && (
          <p className="text-center text-sm text-[var(--color-text-muted)] py-6">
            No orders today for this number.
          </p>
        )}

        {orders !== null && orders.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)] flex items-center gap-2">
              <Receipt className="h-4 w-4 text-[var(--color-primary)]" />
              Today&apos;s Orders
            </h2>
            {orders.map((order) => (
              <Link key={order.id} href={`/store/${slug}/order/${order.id}`}
                className="glass rounded-2xl p-4 flex items-center justify-between gap-4 hover:border-[var(--color-primary)] transition-all">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl gradient-primary flex items-center justify-center text-white font-black shrink-0">
                    {order.queueNumber ?? "—"}
                  </div>
                  <div>
                    <p className="text-sm font-black">{formatPrice(order.total)}</p>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                      {displayOrderStatus(order.status).replace(/_/g, " ")} ·{" "}
                      {new Date(order.createdAt).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-[var(--color-text-muted)] shrink-0" />
              </Link>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
