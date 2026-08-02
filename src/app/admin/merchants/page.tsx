"use client";

// =============================================================================
// Admin Merchants — merchant oversight with suspend / reactivate
// =============================================================================

import { useState, useEffect } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { daysUntilPurge, PURGE_AFTER_DAYS } from "@/lib/trial";

interface MerchantRow {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  isVerified: boolean;
  trialEndsAt: string | null;
  earlyBird: boolean;
  frozenAt: string | null;
  createdAt: string;
  store: {
    id: string;
    name: string;
    slug: string;
    status: string;
    suspendedAt: string | null;
    createdAt: string;
    orderCount: number;
    gmv: number;
  } | null;
}

export default function AdminMerchantsPage() {
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pendingStoreId, setPendingStoreId] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(false);
      const res = await fetch("/api/admin/merchants");
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Request failed");
      setMerchants(json.data);
    } catch (err) {
      console.error("Failed to fetch merchants", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const updateStatus = async (store: NonNullable<MerchantRow["store"]>) => {
    const nextStatus = store.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    if (
      nextStatus === "SUSPENDED" &&
      !window.confirm(
        `Suspend ${store.name}? The storefront goes offline, the merchant is locked out, and the account is permanently deleted after ${PURGE_AFTER_DAYS} days.`
      )
    ) {
      return;
    }
    try {
      setPendingStoreId(store.id);
      const res = await fetch(`/api/admin/stores/${store.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Request failed");
      await fetchData();
    } catch (err) {
      console.error("Failed to update store status", err);
    } finally {
      setPendingStoreId(null);
    }
  };

  const patchTrial = async (
    userId: string,
    body: { approve?: true; earlyBird?: boolean; freeze?: boolean }
  ) => {
    try {
      setPendingUserId(userId);
      const res = await fetch(`/api/admin/merchants/${userId}/trial`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Request failed");
      await fetchData();
    } catch (err) {
      console.error("Failed to update merchant trial", err);
    } finally {
      setPendingUserId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="h-8 w-8 text-[var(--color-primary)] opacity-40 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="glass rounded-3xl p-8 border border-[var(--color-border)] text-center max-w-sm">
          <h2 className="text-lg font-bold">Could not load merchants</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Something went wrong fetching the merchant list.
          </p>
          <button
            onClick={fetchData}
            className="mt-4 px-4 py-2 rounded-xl gradient-primary text-white text-xs font-bold"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Merchants</h1>
          <p className="text-[var(--color-text-secondary)] text-sm">Every merchant on the platform and their store.</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 rounded-xl glass hover:bg-[var(--color-bg-tertiary)] transition-all text-xs font-bold"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh Data
        </button>
      </div>

      <div className="glass rounded-3xl border border-[var(--color-border)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--color-border)" }}>
              <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Merchant</th>
              <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Store</th>
              <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Status</th>
              <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Created</th>
              <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Orders</th>
              <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">GMV</th>
              <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Action</th>
            </tr>
          </thead>
          <tbody>
            {merchants.map((m) => {
              const store = m.store;
              return (
                <tr key={m.userId} className="border-b last:border-0" style={{ borderColor: "var(--color-border)" }}>
                  <td className="px-6 py-4">
                    <p className="font-bold">{m.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{m.email}</p>
                    {m.phone && <p className="text-xs text-[var(--color-text-muted)]">{m.phone}</p>}
                    <div className="mt-1 flex items-center gap-1.5">
                      {!m.isVerified ? (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest bg-amber-500/15 text-amber-500">
                          Pending approval
                        </span>
                      ) : m.trialEndsAt ? (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest bg-green-500/15 text-green-500">
                          Trial ends {new Date(m.trialEndsAt).toLocaleDateString("en-MY")}
                        </span>
                      ) : null}
                      {m.earlyBird && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                          Early bird
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {store ? (
                      <>
                        <Link
                          href={`/admin/merchants/${store.id}`}
                          className="font-medium hover:text-[var(--color-primary)] hover:underline"
                        >
                          {store.name}
                        </Link>
                        <a
                          href={`/store/${store.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[var(--color-primary)] hover:underline"
                        >
                          /store/{store.slug}
                        </a>
                      </>
                    ) : (
                      <span className="text-xs text-[var(--color-text-muted)]">No store</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={store?.status ?? null} />
                  </td>
                  <td className="px-6 py-4 text-xs text-[var(--color-text-secondary)]">
                    {new Date(m.createdAt).toLocaleDateString("en-MY")}
                  </td>
                  <td className="px-6 py-4 text-right font-bold">{store?.orderCount ?? 0}</td>
                  <td className="px-6 py-4 text-right font-bold">{formatPrice(store?.gmv ?? 0)}</td>
                  <td className="px-6 py-4 text-right">
                    {!m.isVerified && (
                      <button
                        onClick={() => patchTrial(m.userId, { approve: true })}
                        disabled={pendingUserId === m.userId}
                        className="mr-2 rounded-lg px-3 py-2 text-xs font-bold text-white gradient-primary transition-all disabled:opacity-50"
                      >
                        {pendingUserId === m.userId ? "Saving…" : "Approve"}
                      </button>
                    )}
                    <button
                      onClick={() => patchTrial(m.userId, { earlyBird: !m.earlyBird })}
                      disabled={pendingUserId === m.userId}
                      className={`mr-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
                        m.earlyBird ? "border-green-500 bg-green-500 text-white" : ""
                      }`}
                      style={
                        m.earlyBird
                          ? undefined
                          : { borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }
                      }
                    >
                      {m.earlyBird ? "Early bird ✓" : "Early bird"}
                    </button>
                    <button
                      onClick={() => patchTrial(m.userId, { freeze: !m.frozenAt })}
                      disabled={pendingUserId === m.userId}
                      className={`mr-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
                        m.frozenAt ? "border-amber-500 bg-amber-500 text-white" : ""
                      }`}
                      style={
                        m.frozenAt
                          ? undefined
                          : { borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }
                      }
                    >
                      {m.frozenAt ? "Unfreeze" : "Freeze"}
                    </button>
                    {store && (
                      <span className="inline-flex items-center gap-2">
                        <button
                          onClick={() => updateStatus(store)}
                          disabled={pendingStoreId === store.id}
                          className="rounded-lg border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50"
                          style={
                            store.status === "ACTIVE"
                              ? { borderColor: "var(--color-error)", color: "var(--color-error)" }
                              : { borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }
                          }
                        >
                          {pendingStoreId === store.id
                            ? "Saving…"
                            : store.status === "ACTIVE"
                              ? "Suspend"
                              : "Restore"}
                        </button>
                        <PurgeCountdown suspendedAt={store.suspendedAt} />
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {merchants.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-sm text-[var(--color-text-muted)]">
                  No merchants yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PurgeCountdown({ suspendedAt }: { suspendedAt: string | null }) {
  const daysLeft = daysUntilPurge(suspendedAt ? new Date(suspendedAt) : null, new Date());
  if (daysLeft === null) return null;
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest bg-red-500/15 text-red-500">
      deletes in {daysLeft}d
    </span>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest bg-zinc-500/15 text-zinc-500">
        None
      </span>
    );
  }
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
