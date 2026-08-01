"use client";

import { useState, useEffect, useRef } from "react";
import { useCart } from "@/hooks/useCart";
import { formatPrice } from "@/lib/utils";
import { computeCartCharges } from "@/lib/charges";
import { ArrowLeft, Phone, User, MessageSquare, BadgeCheck, Loader2, Banknote, QrCode } from "lucide-react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";

interface CheckoutClientProps {
  // Store's raw `charges` Json column — parsed by computeCartCharges via
  // parseStoreCharges, same as the server does when the order is created.
  charges?: unknown;
}

export default function CheckoutClient({ charges }: CheckoutClientProps) {
  const router = useRouter();
  const { slug } = useParams();
  const { items, storeId, clearCart } = useCart();

  const [isHydrated, setIsHydrated] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"QR" | "CASH">("QR");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once an order is placed the cart is emptied on purpose — the empty-cart
  // guard below must not bounce the customer off the confirmation page.
  const orderPlacedRef = useRef(false);

  // Wait for zustand persist hydration before checking cart emptiness
  useEffect(() => {
    if (useCart.persist.hasHydrated()) {
      setIsHydrated(true);
      return;
    }
    const unsub = useCart.persist.onFinishHydration(() => setIsHydrated(true));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (isHydrated && items.length === 0 && !orderPlacedRef.current) {
      router.push(`/store/${slug}`);
    }
  }, [isHydrated, items, router, slug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    const payload = {
      storeId,
      customerName,
      customerPhone: customerPhone.startsWith("+")
        ? customerPhone
        : `+60${customerPhone.replace(/^0/, "")}`,
      notes,
      paymentMethod,
      items: items.map((item) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        specialInstructions: item.specialInstructions,
      })),
    };

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        orderPlacedRef.current = true;
        clearCart();
        router.push(`/store/${slug}/order/${data.data.orderId}`);
      } else {
        setError(data.error || "Failed to place order. Please try again.");
      }
    } catch {
      setError("Something went wrong. Check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Show nothing until hydrated (prevents flash-redirect)
  if (!isHydrated || items.length === 0) return null;

  const { subtotalCents, lines, totalCents } = computeCartCharges(items, charges);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] pb-12 animate-fade-in">
      <div className="sticky top-0 z-50 bg-[var(--color-bg)]/80 backdrop-blur-xl border-b border-[var(--color-border)] px-6 py-4 flex items-center gap-4">
        <Link href={`/store/${slug}`} className="p-2 -ml-2 hover:bg-[var(--color-bg-tertiary)] rounded-full transition-all">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-black">Checkout</h1>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Order Summary */}
          <section className="space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)] flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-[var(--color-primary)]" />
              Your Selection
            </h2>
            <div className="glass rounded-2xl p-4 divide-y divide-[var(--color-border)]">
              {items.map((item) => (
                <div key={item.menuItemId} className="py-3 first:pt-0 last:pb-0 flex justify-between gap-4">
                  <div className="flex gap-3">
                    <span className="font-bold text-[var(--color-primary)]">x{item.quantity}</span>
                    <div>
                      <p className="font-bold text-sm">{item.name}</p>
                      {item.specialInstructions && (
                        <p className="text-[10px] text-amber-500 italic">&ldquo;{item.specialInstructions}&rdquo;</p>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-medium">{formatPrice(item.price * item.quantity)}</span>
                </div>
              ))}
              <div className="pt-4 space-y-1.5 px-1">
                <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
                  <span>Subtotal</span><span>{formatPrice(subtotalCents / 100)}</span>
                </div>
                {lines.map((line) => (
                  <div key={line.label} className="flex justify-between text-xs text-[var(--color-text-muted)]">
                    <span>{line.label} ({line.rate}%)</span><span>{formatPrice(line.amountCents / 100)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-lg font-black pt-2 mt-2 border-t border-[var(--color-border)]">
                  <span>To Pay</span>
                  <span className="text-[var(--color-primary)]">{formatPrice(totalCents / 100)}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Customer Info */}
          <section className="space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)] flex items-center gap-2">
              <User className="h-4 w-4 text-[var(--color-primary)]" />
              Contact Details
            </h2>
            <div className="glass rounded-2xl p-6 space-y-5 shadow-xl">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--color-text-secondary)] ml-1">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
                  <input required type="text" placeholder="Enter your name" value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none transition-all" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--color-text-secondary)] ml-1">Phone Number (Malaysia)</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
                  <div className="absolute left-10 top-1/2 -translate-y-1/2 text-sm font-bold text-[var(--color-text-muted)] border-r border-[var(--color-border)] pr-2">+60</div>
                  <input required type="tel" placeholder="123456789" value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ""))}
                    className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-xl pl-20 pr-4 py-3 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none transition-all" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--color-text-secondary)] ml-1">Additional Notes (Optional)</label>
                <div className="relative">
                  <MessageSquare className="absolute left-3 top-4 h-4 w-4 text-[var(--color-text-muted)]" />
                  <textarea placeholder="e.g. Please wrap separately" value={notes} onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none min-h-[100px] transition-all" />
                </div>
              </div>
            </div>
          </section>

          {/* Payment Method */}
          <section className="space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)] flex items-center gap-2">
              <QrCode className="h-4 w-4 text-[var(--color-primary)]" />
              Payment Method
            </h2>
            <div className="grid grid-cols-1 gap-3">
              {(
                [
                  { key: "QR", icon: <div className="h-10 w-10 bg-white rounded-lg flex items-center justify-center shadow-lg text-indigo-600"><QrCode className="h-6 w-6" /></div>, title: "Scan & Pay (DuitNow QR)", sub: "Pay from any banking app, then upload your receipt" },
                  { key: "CASH", icon: <div className="h-10 w-10 bg-white rounded-lg flex items-center justify-center shadow-lg text-green-600"><Banknote className="h-6 w-6" /></div>, title: "Pay at Counter", sub: "The shop confirms once you've paid" },
                ] as const
              ).map(({ key, icon, title, sub }) => (
                <button key={key} type="button" onClick={() => setPaymentMethod(key)}
                  className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${paymentMethod === key ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5 ring-1 ring-[var(--color-primary)]" : "border-[var(--color-border)] glass opacity-60 hover:opacity-100"}`}>
                  <div className="flex items-center gap-4">
                    {icon}
                    <div className="text-left">
                      <p className="text-sm font-black text-[var(--color-text)]">{title}</p>
                      <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-tighter">{sub}</p>
                    </div>
                  </div>
                  {paymentMethod === key && <BadgeCheck className="h-6 w-6 text-[var(--color-primary)]" />}
                </button>
              ))}
            </div>
          </section>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">
              {error}
            </div>
          )}

          <button type="submit" disabled={isSubmitting}
            className="w-full py-4 rounded-2xl gradient-primary text-white font-black tracking-widest uppercase text-sm shadow-2xl shadow-orange-500/40 hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50">
            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : (
              paymentMethod === "CASH"
                ? <>Place Order — Pay {formatPrice(totalCents / 100)} at Counter</>
                : <>Place Order — Pay {formatPrice(totalCents / 100)} via QR</>
            )}
          </button>

          <p className="text-center text-[10px] text-[var(--color-text-muted)] px-8">
            By placing this order, you agree to our Terms of Service and Privacy Policy.
            {" "}Your queue number is issued once the shop confirms your payment.
          </p>
        </form>
      </div>
    </div>
  );
}
