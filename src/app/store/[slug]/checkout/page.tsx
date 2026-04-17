"use client";

import { useState, useEffect } from "react";
import { useCart } from "@/hooks/useCart";
import { formatPrice } from "@/lib/utils";
import { ArrowLeft, CreditCard, Phone, User, MessageSquare, ShieldCheck, BadgeCheck, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";

export default function CheckoutPage() {
  const router = useRouter();
  const { slug } = useParams();
  const { items, getTotal, getTax, getFinalTotal, storeId, clearCart } = useCart();
  
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentGateway, setPaymentGateway] = useState<"STRIPE" | "BILLPLZ">("STRIPE");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (items.length === 0) {
      router.push(`/store/${slug}`);
    }
  }, [items, router, slug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    const payload = {
      storeId,
      customerName,
      customerPhone: customerPhone.startsWith("+") ? customerPhone : `+60${customerPhone.replace(/^0/, "")}`,
      notes,
      paymentGateway,
      items: items.map(item => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        specialInstructions: item.specialInstructions
      }))
    };

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success && data.data.checkoutUrl) {
        // Clear cart before redirecting
        clearCart();
        // Redirect to external payment gateway (Stripe/Billplz)
        window.location.href = data.data.checkoutUrl;
      } else {
        setError(data.error || "Failed to initiate payment. Please try again.");
      }
    } catch (err) {
      setError("Something went wrong. Check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="min-h-screen bg-[var(--color-bg)] pb-12 animate-fade-in">
      {/* Header */}
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
                        <p className="text-[10px] text-amber-500 italic">"{item.specialInstructions}"</p>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-medium">{formatPrice(item.price * item.quantity)}</span>
                </div>
              ))}
              
              <div className="pt-4 space-y-1.5 px-1">
                <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
                  <span>Subtotal</span>
                  <span>{formatPrice(getTotal())}</span>
                </div>
                <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
                  <span>SST (6%)</span>
                  <span>{formatPrice(getTax())}</span>
                </div>
                <div className="flex justify-between text-lg font-black pt-2 mt-2 border-t border-[var(--color-border)]">
                  <span>To Pay</span>
                  <span className="text-[var(--color-primary)]">{formatPrice(getFinalTotal())}</span>
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
            <div className="glass rounded-2xl p-6 space-y-5 shadow-xl border-l-4 border-l-[var(--color-primary)]">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--color-text-secondary)] ml-1">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
                  <input 
                    required
                    type="text" 
                    placeholder="Enter your name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--color-text-secondary)] ml-1">Phone Number (Malaysia)</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
                  <div className="absolute left-10 top-1/2 -translate-y-1/2 text-sm font-bold text-[var(--color-text-muted)] border-r border-[var(--color-border)] pr-2">
                    +60
                  </div>
                  <input 
                    required
                    type="tel" 
                    placeholder="123456789"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ""))}
                    className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-xl pl-20 pr-4 py-3 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--color-text-secondary)] ml-1">Additional Notes (Optional)</label>
                <div className="relative">
                  <MessageSquare className="absolute left-3 top-4 h-4 w-4 text-[var(--color-text-muted)]" />
                  <textarea 
                    placeholder="e.g. Please wrap separately"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none min-h-[100px] transition-all"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Payment Method Selector */}
          <section className="space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)] flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-[var(--color-primary)]" />
              Payment Method
            </h2>
            <div className="grid grid-cols-1 gap-3">
              <button 
                type="button"
                onClick={() => setPaymentGateway("BILLPLZ")}
                className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${paymentGateway === "BILLPLZ" ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5 ring-1 ring-[var(--color-primary)]" : "border-[var(--color-border)] glass opacity-60 hover:opacity-100"}`}
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 bg-white rounded-lg flex items-center justify-center shadow-lg text-blue-600 font-bold">FPX</div>
                  <div className="text-left">
                    <p className="text-sm font-black text-[var(--color-text)]">Bank Transfer (FPX)</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-tighter">Malaysian Online Banking</p>
                  </div>
                </div>
                {paymentGateway === "BILLPLZ" && <BadgeCheck className="h-6 w-6 text-[var(--color-primary)]" />}
              </button>

              <button 
                type="button"
                onClick={() => setPaymentGateway("STRIPE")}
                className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${paymentGateway === "STRIPE" ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5 ring-1 ring-[var(--color-primary)]" : "border-[var(--color-border)] glass opacity-60 hover:opacity-100"}`}
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 bg-white rounded-lg flex items-center justify-center shadow-lg text-indigo-600">
                    <CreditCard className="h-6 w-6" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-[var(--color-text)]">Credit / Debit Card</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-tighter">Powered by Stripe</p>
                  </div>
                </div>
                {paymentGateway === "STRIPE" && <BadgeCheck className="h-6 w-6 text-[var(--color-primary)]" />}
              </button>
            </div>
          </section>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm animate-shake">
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 rounded-2xl gradient-primary text-white font-black tracking-widest uppercase text-sm shadow-2xl shadow-orange-500/40 hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>Place Order & Pay {formatPrice(getFinalTotal())}</>
            )}
          </button>
          
          <p className="text-center text-[10px] text-[var(--color-text-muted)] px-8">
            By placing this order, you agree to our Terms of Service and Privacy Policy. All payments are processed securely.
          </p>
        </form>
      </div>
    </div>
  );
}
