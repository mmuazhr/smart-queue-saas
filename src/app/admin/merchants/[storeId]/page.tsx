"use client";

// =============================================================================
// Admin Store Detail — read-only support view of one merchant's store
// =============================================================================
// Structurally read-only: the page only calls the admin GET endpoint, which
// records every visit in audit_logs.  Suspend / reactivate stays on the list.

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Eye } from "lucide-react";
import { formatPrice, formatRelativeTime, displayOrderStatus } from "@/lib/utils";

interface OrderItem {
  id: string;
  itemName: string;
  quantity: number;
  lineTotal: number;
  specialInstructions: string | null;
}

interface Order {
  id: string;
  queueNumber: number | null;
  status: string;
  customerName: string;
  customerPhone: string;
  total: number;
  notes: string | null;
  createdAt: string;
  orderItems: OrderItem[];
}

interface StoreDetail {
  store: {
    id: string;
    name: string;
    slug: string;
    status: string;
    createdAt: string;
  };
  owner: { id: string; name: string; email: string };
  activeOrders: Order[];
  menuSummary: { category: string; itemCount: number }[];
  todayStats: { orders: number; gmv: number };
}

// Keyed on the display label (see displayOrderStatus) — PAID and ACCEPTED
// share the merged "Accepted" kanban stage, so both resolve to the same
// warning color here.
const STATUS_COLORS: Record<string, string> = {
  ACCEPTED: "var(--color-warning)",
  PREPARING: "var(--color-primary)",
  READY: "var(--color-success)",
};

export default function AdminStoreDetailPage() {
  const params = useParams<{ storeId: string }>();
  const storeId = params.storeId;
  const [detail, setDetail] = useState<StoreDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const res = await fetch(`/api/admin/stores/${storeId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Request failed");
      setDetail(json.data);
    } catch (err) {
      console.error("Failed to fetch store detail", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="h-8 w-8 text-[var(--color-primary)] opacity-40 animate-spin" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="glass rounded-3xl p-8 border border-[var(--color-border)] text-center max-w-sm">
          <h2 className="text-lg font-bold">Could not load store</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Something went wrong fetching this store.
          </p>
          <button
            onClick={fetchDetail}
            className="mt-4 px-4 py-2 rounded-xl gradient-primary text-white text-xs font-bold"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const { store, owner, activeOrders, menuSummary, todayStats } = detail;

  return (
    <div className="space-y-8 pb-12">
      <Link
        href="/admin/merchants"
        className="inline-flex items-center gap-2 text-xs font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Merchants
      </Link>

      <div
        className="flex items-center gap-3 rounded-2xl px-5 py-4 text-xs font-bold"
        style={{ background: "var(--color-warning-bg)", color: "var(--color-warning)" }}
      >
        <Eye className="h-4 w-4 shrink-0" />
        READ-ONLY SUPPORT VIEW — actions are disabled. Every visit is recorded in the audit log.
      </div>

      <div className="glass rounded-3xl border border-[var(--color-border)] p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight">{store.name}</h1>
              <StatusBadge status={store.status} />
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {owner.name} · {owner.email}
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Store created {new Date(store.createdAt).toLocaleDateString("en-MY")}
            </p>
          </div>
          <a
            href={`/store/${store.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl glass px-4 py-2 text-xs font-bold hover:bg-[var(--color-bg-tertiary)] transition-all"
          >
            View storefront /store/{store.slug}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Orders Today" value={String(todayStats.orders)} />
        <StatCard label="GMV Today" value={formatPrice(todayStats.gmv)} />
      </div>

      <div>
        <h2 className="mb-4 text-lg font-bold">Live Queue</h2>
        {activeOrders.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed p-8 text-center text-sm"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
          >
            No active orders right now.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activeOrders.map((order) => {
              const color = STATUS_COLORS[displayOrderStatus(order.status)] ?? "var(--color-text-muted)";
              return (
                <div key={order.id} className="glass rounded-xl p-4">
                  <div className="mb-3 flex items-start justify-between">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold"
                      style={{ background: `${color}15`, color }}
                    >
                      #{order.queueNumber || "—"}
                    </div>
                    <div className="text-right">
                      <span
                        className="rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest"
                        style={{ background: `${color}15`, color }}
                      >
                        {displayOrderStatus(order.status)}
                      </span>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                        {formatRelativeTime(new Date(order.createdAt))}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm font-medium">{order.customerName}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{order.customerPhone}</p>

                  <div className="mt-2 space-y-1">
                    {order.orderItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex justify-between text-xs text-[var(--color-text-secondary)]"
                      >
                        <span>
                          {item.quantity}× {item.itemName}
                        </span>
                        <span>{formatPrice(item.lineTotal)}</span>
                      </div>
                    ))}
                  </div>

                  {order.notes && (
                    <p
                      className="mt-2 rounded-md px-2 py-1 text-xs italic"
                      style={{ background: "var(--color-warning-bg)", color: "var(--color-warning)" }}
                    >
                      {order.notes}
                    </p>
                  )}

                  <div
                    className="mt-3 flex items-center justify-between border-t pt-3 text-sm font-semibold"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <span>Total</span>
                    <span style={{ color: "var(--color-primary)" }}>{formatPrice(order.total)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-bold">Menu Summary</h2>
        <div className="glass rounded-3xl border border-[var(--color-border)] divide-y" style={{ borderColor: "var(--color-border)" }}>
          {menuSummary.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-[var(--color-text-muted)]">
              No menu categories yet.
            </p>
          ) : (
            menuSummary.map((c) => (
              <div key={c.category} className="flex items-center justify-between px-6 py-4">
                <span className="text-sm font-medium">{c.category}</span>
                <span className="text-xs font-bold text-[var(--color-text-secondary)]">
                  {c.itemCount} item{c.itemCount !== 1 ? "s" : ""}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-3xl border border-[var(--color-border)] p-6">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "ACTIVE";
  const isSuspended = status === "SUSPENDED";
  const tone = isActive
    ? "bg-green-500/15 text-green-500"
    : isSuspended
      ? "bg-red-500/15 text-red-500"
      : "bg-zinc-500/15 text-zinc-500";
  return (
    <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${tone}`}>
      {status}
    </span>
  );
}
