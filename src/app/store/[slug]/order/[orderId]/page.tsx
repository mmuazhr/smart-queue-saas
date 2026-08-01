"use client";

import { useState, useEffect } from "react";
import { formatPrice, formatWaitTime } from "@/lib/utils";
import {
  CheckCircle2, Clock, ChefHat, PackageCheck, AlertCircle,
  ArrowLeft, MapPin, PhoneCall, Share2, RefreshCw, Banknote,
  Printer, Download, X,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useOrderStream } from "@/hooks/useOrderStream";
import PaymentPanel from "@/components/customer/PaymentPanel";

interface OrderItem {
  id: string;
  itemName: string;
  quantity: number;
  lineTotal: number;
}

interface Order {
  id: string;
  status: string;
  queueNumber: number | null;
  estimatedWaitMins: number | null;
  subtotal: number;
  tax: number;
  total: number;
  chargeBreakdown: { label: string; rate: number; amountCents: number }[] | null;
  customerName: string;
  paymentMethod: string;
  paymentStatus: string;
  hasProof: boolean;
  createdAt: string;
  orderItems: OrderItem[];
  store: {
    name: string;
    address: string | null;
    phone: string | null;
    paymentQrUrl: string | null;
    paymentInstructions: string | null;
  };
}

/** The install prompt event is not in lib.dom yet. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

const PWA_NUDGE_KEY = "queless-pwa-nudge-dismissed";

export default function OrderTrackingPage() {
  const { slug, orderId } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showPwaNudge, setShowPwaNudge] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  const { data: streamData } = useOrderStream(orderId as string);

  // localStorage and matchMedia are browser-only — the page is prerendered.
  useEffect(() => {
    if (localStorage.getItem(PWA_NUDGE_KEY)) return;
    if (!window.matchMedia("(display-mode: browser)").matches) return;
    setShowPwaNudge(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismissPwaNudge() {
    localStorage.setItem(PWA_NUDGE_KEY, "1");
    setShowPwaNudge(false);
  }

  useEffect(() => {
    async function fetchOrder() {
      try {
        const res = await fetch(`/api/orders/${orderId}`);
        const data = await res.json();
        if (data.success) setOrder(data.data);
        else setError(data.error || "Order not found.");
      } catch {
        setError("Failed to load order tracking.");
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [orderId]);

  useEffect(() => {
    if (streamData && (streamData as { type: string }).type === "ORDER_UPDATE") {
      const update = streamData as { status: string; queueNumber: number; estimatedWaitMins: number; paymentStatus: string };
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              status: update.status,
              queueNumber: update.queueNumber,
              estimatedWaitMins: update.estimatedWaitMins,
              paymentStatus: update.paymentStatus,
            }
          : null
      );
    }
  }, [streamData]);

  if (loading) return <div className="min-h-screen flex items-center justify-center animate-pulse-glow">Tracking your order...</div>;
  if (error || !order) return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div className="glass p-8 rounded-3xl max-w-sm">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2">Order Error</h1>
        <p className="text-sm text-[var(--color-text-muted)] mb-6">{error}</p>
        <Link href={`/store/${slug}`} className="px-6 py-2 rounded-xl gradient-primary text-white text-sm font-bold">Back to Store</Link>
      </div>
    </div>
  );

  const steps = [
    { key: "PAID",      label: "Confirmed",  icon: <CheckCircle2 className="h-5 w-5" />,  desc: "Order received" },
    { key: "ACCEPTED",  label: "Accepted",   icon: <BadgeCheckIcon className="h-5 w-5" />, desc: "Vendor accepted" },
    { key: "PREPARING", label: "Preparing",  icon: <ChefHat className="h-5 w-5" />,        desc: "Cooking your food" },
    { key: "READY",     label: "Ready",      icon: <PackageCheck className="h-5 w-5" />,   desc: "Ready for pickup!" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === order.status);
  const isCancelled = order.status === "CANCELLED";
  const isCompleted = order.status === "COMPLETED";
  const isAwaitingConfirmation = order.status === "AWAITING_CONFIRMATION";
  // A queue number exists once the order is confirmed — the receipt should be
  // available from that point onward, not just once COMPLETED.
  const isConfirmed = !isAwaitingConfirmation && !isCancelled;
  // The payment panel already covers "pay at counter" messaging while awaiting
  // confirmation — showing this banner too would duplicate it.
  const isCashPending = order.paymentMethod === "CASH" && order.paymentStatus === "PENDING" && !isAwaitingConfirmation;

  return (
    <div className="min-h-screen bg-[var(--color-bg)] pb-12 animate-fade-in">
      <div className="sticky top-0 z-50 bg-[var(--color-bg)]/80 backdrop-blur-xl border-b border-[var(--color-border)] px-6 py-4 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Link href={`/store/${slug}`} className="p-2 -ml-2 hover:bg-[var(--color-bg-tertiary)] rounded-full transition-all">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-black shrink-0">Order Tracking</h1>
        </div>
        <button onClick={() => window.location.reload()} className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded-full transition-all opacity-40">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="max-w-md mx-auto px-6 py-8 space-y-8">
        {/* Cash payment notice */}
        {isCashPending && (
          <div className="p-5 bg-green-500/10 border border-green-500/30 rounded-3xl flex items-start gap-4">
            <Banknote className="h-8 w-8 text-green-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-green-500">Pay at the Counter</p>
              <p className="text-sm text-green-500/80 mt-1">
                Please pay <span className="font-bold">{formatPrice(order.total)}</span> at the counter when you collect your order.
              </p>
            </div>
          </div>
        )}

        {/* Queue number, or the payment panel while awaiting merchant confirmation */}
        {isAwaitingConfirmation ? (
          <section className="space-y-4">
            <div className="text-center">
              <p className="text-lg font-black text-[var(--color-text)]">Almost there — complete your payment</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Your queue number is issued once the shop confirms.</p>
            </div>
            <PaymentPanel
              order={order}
              onProofUploaded={() => setOrder((prev) => (prev ? { ...prev, hasProof: true } : null))}
            />
          </section>
        ) : (
          <section className={`glass rounded-3xl p-8 text-center shadow-2xl transition-all duration-500 ${order.status === "READY" ? "ring-2 ring-green-500/50 bg-green-500/5" : ""}`}>
            <p className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-1">Your Queue Number</p>
            <div className="text-7xl font-black text-[var(--color-primary)] mb-4 drop-shadow-xl">
              {order.queueNumber || "..."}
            </div>
            <div className="h-px w-12 bg-[var(--color-border)] mx-auto mb-4" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-[var(--color-text)]">
                {isCancelled ? "Order Cancelled" : isCompleted ? "Order Completed" : order.status === "READY" ? "It's Ready!" : "Please wait…"}
              </p>
              {!isCancelled && !isCompleted && order.status !== "READY" && (
                <p className="text-xs text-[var(--color-text-muted)] flex items-center justify-center gap-1.5">
                  <Clock className="h-3 w-3" /> Estimated Wait:{" "}
                  <span className="text-[var(--color-primary)] font-bold">{formatWaitTime(order.estimatedWaitMins || 0)}</span>
                </p>
              )}
            </div>
          </section>
        )}

        {/* Receipt — available once the order is confirmed (queue number issued) */}
        {isConfirmed && (
          <section className="rounded-3xl p-6 space-y-3 font-mono bg-[var(--color-bg-secondary)] border border-[var(--color-border)]">
            <div className="text-center space-y-0.5">
              <h2 className="text-sm font-black uppercase tracking-wide">{order.store.name}</h2>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Receipt #{order.id.slice(-6).toUpperCase()} · Queue #{order.queueNumber ?? "—"}
              </p>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                {new Date(order.createdAt).toLocaleString("en-MY", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })} · {order.paymentMethod === "CASH" ? "Cash" : "QR"}
              </p>
            </div>

            <div className="border-t border-dashed border-[var(--color-border)]" />

            <div className="space-y-1">
              {order.orderItems.map((item) => (
                <div key={item.id} className="flex justify-between gap-4 text-xs">
                  <span>{item.quantity}x&nbsp;&nbsp;{item.itemName}</span>
                  <span className="shrink-0">{formatPrice(item.lineTotal)}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-[var(--color-border)]" />

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
                <span>Subtotal</span><span>{formatPrice(order.subtotal)}</span>
              </div>
              {(order.chargeBreakdown ?? []).map((line) => (
                <div key={line.label} className="flex justify-between text-xs text-[var(--color-text-muted)]">
                  <span>{line.label} ({line.rate}%)</span><span>{formatPrice(line.amountCents / 100)}</span>
                </div>
              ))}
            </div>

            <div className="border-t-4 border-double border-[var(--color-text)]" />

            <div className="flex justify-between text-sm font-black">
              <span>TOTAL</span>
              <span>{formatPrice(order.total)}</span>
            </div>

            <div className="border-t border-dashed border-[var(--color-border)]" />

            <p className="text-center text-[11px] text-[var(--color-text-muted)] pt-1">
              Thank you! Come again :)
            </p>

            <button onClick={() => window.print()}
              className="w-full py-3 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] transition-all text-xs font-bold font-sans flex items-center justify-center gap-2 print:hidden">
              <Printer className="h-3.5 w-3.5" /> Print receipt
            </button>
          </section>
        )}

        {/* Stepper — suppressed while awaiting confirmation, no AWAITING_CONFIRMATION step exists */}
        {!isCancelled && !isCompleted && !isAwaitingConfirmation && (
          <section className="space-y-6 px-2">
            <div className="relative">
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-[var(--color-border)]" />
              <div className="absolute left-6 top-0 w-0.5 bg-[var(--color-primary)] transition-all duration-1000"
                style={{ height: `${(Math.max(0, currentStepIndex) / (steps.length - 1)) * 100}%` }} />
              <div className="space-y-8">
                {steps.map((step, index) => {
                  const isDone = index < currentStepIndex;
                  const isActive = index === currentStepIndex;
                  const isPending = index > currentStepIndex;
                  return (
                    <div key={step.key} className={`relative flex items-center gap-6 transition-all duration-500 ${isPending ? "opacity-30 grayscale" : ""}`}>
                      <div className={`z-10 h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-500 ${isActive ? "gradient-primary scale-110 text-white ring-4 ring-orange-500/20" : isDone ? "bg-green-500 text-white" : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]"}`}>
                        {isDone ? <CheckCircle2 className="h-6 w-6" /> : step.icon}
                      </div>
                      <div className="flex-1">
                        <p className={`text-sm font-black ${isActive ? "text-[var(--color-primary)]" : "text-[var(--color-text)]"}`}>{step.label}</p>
                        <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">{step.desc}</p>
                      </div>
                      {isActive && <div className="h-2 w-2 rounded-full bg-[var(--color-primary)] animate-ping" />}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {isCancelled && (
          <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-3xl text-center">
            <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-2" />
            <h3 className="font-bold text-red-500">Order Cancelled</h3>
            <p className="text-xs text-red-500/70 mt-1">Please contact the vendor for more details or a refund if applicable.</p>
          </div>
        )}

        <section className="glass rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl gradient-primary flex items-center justify-center text-white p-2">
              <MapPin className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-black">{order.store.name}</h4>
              <p className="text-xs text-[var(--color-text-muted)] line-clamp-1">{order.store.address}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 print:hidden">
            <a href={`tel:${order.store.phone}`} className="flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] transition-all text-xs font-bold">
              <PhoneCall className="h-3.5 w-3.5" /> Call Store
            </a>
            <button className="flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] transition-all text-xs font-bold"
              onClick={() => navigator.share?.({ title: `My Queue #${order.queueNumber}`, text: `Track my order at ${order.store.name}`, url: window.location.href })}>
              <Share2 className="h-3.5 w-3.5" /> Share
            </button>
          </div>
        </section>

        {showPwaNudge && (
          <div className="p-4 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 rounded-2xl flex items-start gap-3 print:hidden">
            <Download className="h-5 w-5 text-[var(--color-primary)] shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <p className="text-xs font-bold text-[var(--color-text)]">
                Add QueLess to your home screen for one-tap ordering.
              </p>
              {installPrompt && (
                <button onClick={() => { installPrompt.prompt(); dismissPwaNudge(); }}
                  className="px-4 py-2 rounded-xl gradient-primary text-white text-[10px] font-black uppercase tracking-widest">
                  Install
                </button>
              )}
            </div>
            <button onClick={dismissPwaNudge} aria-label="Dismiss"
              className="p-1 -m-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <p className="text-center text-[10px] text-[var(--color-text-muted)] italic px-6 leading-relaxed print:hidden">
          Order ID: {order.id}<br />Keep this page open to see live updates.
        </p>
      </div>
    </div>
  );
}

function BadgeCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
