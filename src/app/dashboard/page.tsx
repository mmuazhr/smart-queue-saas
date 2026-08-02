"use client";

// =============================================================================
// Dashboard Queue Page — Live order Kanban board
// =============================================================================

import { useEffect, useState, useCallback, useRef } from "react";
import { formatPrice, formatRelativeTime } from "@/lib/utils";
import { OrderAgeBadge } from "@/components/dashboard/OrderAgeBadge";
import { AlertTriangle } from "lucide-react";

interface OrderItem {
  id: string;
  itemName: string;
  quantity: number;
  lineTotal: string;
  specialInstructions: string | null;
}

interface Order {
  id: string;
  queueNumber: number | null;
  status: string;
  customerName: string;
  customerPhone: string;
  total: string;
  notes: string | null;
  createdAt: string;
  orderItems: OrderItem[];
  paymentMethod?: string;
  hasProof?: boolean;
  estimatedReadyAt?: string | null;
  delayReason?: string | null;
}

// PAID and ACCEPTED are merged into one "Accepted" stage — confirming payment
// IS accepting the order. `statuses` lists every order status that lands in
// the column; ACCEPTED stays listed alongside PAID only so legacy in-flight
// rows (confirmed before this merge shipped) still render and act correctly.
const COLUMNS = [
  { key: "AWAITING_CONFIRMATION", statuses: ["AWAITING_CONFIRMATION"], label: "Unconfirmed", color: "var(--color-warning)", nextAction: "Confirm", nextStatus: "PAID", rejectStatus: "CANCELLED" },
  { key: "PAID", statuses: ["PAID", "ACCEPTED"], label: "Accepted", color: "var(--color-warning)", nextAction: "Start Preparing", nextStatus: "PREPARING", rejectStatus: "CANCELLED" },
  { key: "PREPARING", statuses: ["PREPARING"], label: "Preparing", color: "var(--color-primary)", nextAction: "Mark Ready", nextStatus: "READY" },
  { key: "READY", statuses: ["READY"], label: "Ready", color: "var(--color-success)", nextAction: "Complete", nextStatus: "COMPLETED" },
];

const CHIME_REPEAT_MS = 20_000; // how often the alert replays while orders sit unconfirmed

import { useOrderStream } from "@/hooks/useOrderStream";

export default function QueueDashboardPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [ordersPaused, setOrdersPaused] = useState(false);
  const [pauseToggling, setPauseToggling] = useState(false);
  const [queueDelayMins, setQueueDelayMins] = useState(0);
  const [delayBusy, setDelayBusy] = useState(false);
  const [expandedProofOrderId, setExpandedProofOrderId] = useState<string | null>(null);
  const prevUnconfirmedCount = useRef(0);
  const chimeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: streamData } = useOrderStream(undefined, storeId || undefined);

  // Fetch store first
  useEffect(() => {
    async function fetchStore() {
      const res = await fetch("/api/stores");
      const data = await res.json();
      if (data.success && data.data.length > 0) {
        setStoreId(data.data[0].id);
        setOrdersPaused(!!data.data[0].ordersPaused);
        setQueueDelayMins(data.data[0].queueDelayMins ?? 0);
      }
      setLoading(false);
    }
    fetchStore();
  }, []);

  // Optimistic — this is the emergency-use toggle, no confirm dialog. Revert
  // on a failed PUT so the switch never lies about the server's actual state.
  async function toggleOrdersPaused() {
    if (!storeId || pauseToggling) return;
    const next = !ordersPaused;
    setOrdersPaused(next);
    setPauseToggling(true);
    try {
      const res = await fetch(`/api/stores/${storeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordersPaused: next }),
      });
      if (!res.ok) {
        setOrdersPaused(!next);
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Could not update queue status — please try again.");
      }
    } catch {
      setOrdersPaused(!next);
      setActionError("Network problem — queue status was not updated. Check your connection and retry.");
    } finally {
      setPauseToggling(false);
    }
  }

  // Fetch initial orders
  const fetchOrders = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/orders?storeId=${storeId}&status=AWAITING_CONFIRMATION,PAID,ACCEPTED,PREPARING,READY`);
      const data = await res.json();
      if (data.success) {
        setOrders(data.data);
        // Seed the baseline so page-load with pre-existing unconfirmed orders
        // doesn't fire the "count rose" chime — the repeating interval (below)
        // still picks them up on its own cadence.
        prevUnconfirmedCount.current = data.data.filter((o: Order) => o.status === "AWAITING_CONFIRMATION").length;
      }
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    }
  }, [storeId]);

  useEffect(() => {
    if (storeId) fetchOrders();
  }, [storeId, fetchOrders]);

  // Handle Stream Updates
  useEffect(() => {
    if (streamData && streamData.type === "STORE_QUEUE_UPDATE") {
      setOrders(streamData.orders as Order[]);
    }
  }, [streamData]);

  const unconfirmedCount = orders.filter((o) => o.status === "AWAITING_CONFIRMATION").length;
  const hasUnconfirmed = unconfirmedCount > 0;

  // Rise chime: fires immediately whenever the unconfirmed count increases
  // (a new order arrived, or one dropped back in). Keyed on the raw count so
  // every increase is caught, independent of the interval's own cadence.
  useEffect(() => {
    if (unconfirmedCount > prevUnconfirmedCount.current) {
      playNotificationSound();
    }
    prevUnconfirmedCount.current = unconfirmedCount;
  }, [unconfirmedCount]);

  // Repeating alert: replay every CHIME_REPEAT_MS while at least one order is
  // waiting. Keyed on the boolean hasUnconfirmed (not the raw count) so a
  // Confirm/Reject that leaves the column non-empty doesn't restart the
  // cadence — the interval is created once when the column becomes
  // non-empty and torn down once when it empties. The cleanup always runs
  // before the next effect invocation (dependency change, StrictMode
  // double-invoke, or unmount), so there is never more than one interval
  // alive at a time.
  useEffect(() => {
    if (hasUnconfirmed) {
      chimeIntervalRef.current = setInterval(playNotificationSound, CHIME_REPEAT_MS);
    }

    return () => {
      if (chimeIntervalRef.current) {
        clearInterval(chimeIntervalRef.current);
        chimeIntervalRef.current = null;
      }
    };
  }, [hasUnconfirmed]);

  function playNotificationSound() {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Mj4yCe3J5goWDf3Z5eoGJiYh/d3R6goeIh4F4d3uDi4uIgXh1eYCFhYF8eHyDi4yKhH16fYGEhYKAfn+DiI2NioSDgIGChIWEhIODhImNjouHhIOBgYGBgoKDhYiMjo6Lh4SDgH9/f3+Bg4eKjY6Ni4iFgn9+fn5+gIOGioyNjIqIhYJ/fXx8fX+ChYiLjI2LiYaEgX5+fn5/gYSHiouLi4mHhIJ/fn19fn+BhIeKi4uLiYeEgn9+fX1+gIKFiIqLi4qIhoSBf359fX+Ag4aIiouLioiGhIF/fn19f4GDhoiKi4uKiIaEgX9+fX1/gYOGiIqLi4qIhoSBf359fX+Bg4aIiouLioiGhIF/fn19f4GDhoiKi4qKiIaEgX9+fX5/gYOGiIqLi4qIhoSBf359fn+Bg4aIiouLioiGhIF/fn19f4GDhoiKi4uKiIaEgX9+fX5/gYOGiIqLi4qIhoSBf359fn+Bg4aIiouLioiGhIF/fn19f4GDhoiKi4qKiIaEgX9+fX5/gYOGiIqLi4qIhoSBf359fn+Bg4aIiouLioiGhIF/fn19");
      }
      audioRef.current.play().catch(() => {/* autoplay blocked */});
    } catch {/* ignore */}
  }

  // expectedStatus is the column the card was sitting in when the merchant
  // clicked — the server rejects the transition (409) if the order has since
  // moved elsewhere (SSE can lag a few seconds), rather than trusting a fresh
  // server-side re-read that could already reflect someone else's action.
  async function updateOrderStatus(orderId: string, status: string, expectedStatus: string) {
    if (updatingOrderId) return; // one transition at a time
    setUpdatingOrderId(orderId);
    setActionError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, expectedStatus }),
      });
      if (res.ok) {
        await fetchOrders();
      } else if (res.status === 409) {
        // Board was stale — refresh to show what actually happened instead
        // of leaving a phantom card the merchant could act on again.
        await fetchOrders();
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "This order was already updated elsewhere — the board has been refreshed.");
      } else {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Could not update the order — please try again.");
      }
    } catch {
      setActionError("Network problem — the order was not updated. Check your connection and retry.");
    } finally {
      setUpdatingOrderId(null);
    }
  }

  function rejectOrder(order: Order) {
    if (!window.confirm(`Cancel order #${order.queueNumber ?? "—"}? This can't be undone.`)) return;
    updateOrderStatus(order.id, "CANCELLED", order.status);
  }

  // window.prompt matches the board's existing confirm() idiom. Cancel aborts;
  // empty string bumps without a reason.
  async function bumpOrderEta(orderId: string, addMins: number) {
    const reason = window.prompt(
      `Add ${addMins} min to this order. Reason shown to the customer (optional):`,
      ""
    );
    if (reason === null) return;
    try {
      const res = await fetch(`/api/orders/${orderId}/eta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addMins, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Could not add time — please try again.");
      } else {
        await fetchOrders();
      }
    } catch {
      setActionError("Network problem — the delay was not saved. Please retry.");
    }
  }

  async function setStoreDelay(delayMins: number) {
    if (!storeId || delayBusy) return;
    let reason: string | null = "";
    if (delayMins > 0) {
      reason = window.prompt(
        "Delay ALL active orders. Reason shown to customers (optional):",
        ""
      );
      if (reason === null) return;
    }
    setDelayBusy(true);
    try {
      const res = await fetch(`/api/stores/${storeId}/queue-delay`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delayMins, ...(reason && reason.trim() ? { reason: reason.trim() } : {}) }),
      });
      if (res.ok) {
        setQueueDelayMins(delayMins);
        await fetchOrders();
      } else {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Could not update the store delay — please try again.");
      }
    } catch {
      setActionError("Network problem — the store delay was not saved. Please retry.");
    } finally {
      setDelayBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      </div>
    );
  }

  if (!storeId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg text-[var(--color-text-secondary)]">No store found.</p>
        <p className="text-sm text-[var(--color-text-muted)]">Go to Settings to create your store.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Live Queue</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {orders.length} active order{orders.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {queueDelayMins > 0 ? (
            <button
              onClick={() => setStoreDelay(0)}
              disabled={delayBusy}
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-500 transition-colors hover:bg-amber-500/20 disabled:opacity-60"
            >
              Kitchen delayed +{queueDelayMins}m · Clear
            </button>
          ) : (
            <button
              onClick={() => setStoreDelay(10)}
              disabled={delayBusy}
              className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--color-bg-tertiary)]"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
            >
              Delay all +10m
            </button>
          )}
          <button
            onClick={toggleOrdersPaused}
            disabled={pauseToggling}
            role="switch"
            aria-checked={!ordersPaused}
            aria-label="Toggle accepting new orders"
            className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
              ordersPaused
                ? "bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20"
                : "bg-green-500/10 border-green-500/30 text-green-600 hover:bg-green-500/20"
            }`}
          >
            {ordersPaused ? "Queue paused" : "Accepting orders"}
          </button>
          <button
            onClick={fetchOrders}
            className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--color-bg-tertiary)]"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
          >
            Refresh
          </button>
        </div>
      </div>

      {ordersPaused && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-500">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Queue is paused — customers cannot place new orders.</span>
        </div>
      )}

      {actionError && (
        <div className="flex items-center justify-between rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} aria-label="Dismiss error" className="font-bold px-2">
            ×
          </button>
        </div>
      )}

      {/* Kanban Columns */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const colOrders = orders.filter((o) => col.statuses.includes(o.status));
          return (
            <div key={col.key} className="flex flex-col">
              {/* Column Header */}
              <div
                className="mb-3 flex items-center gap-2 rounded-lg px-4 py-2.5"
                style={{ background: `${col.color}15` }}
              >
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: col.color }}
                />
                <span className="text-sm font-semibold" style={{ color: col.color }}>
                  {col.label}
                </span>
                <span
                  className="ml-auto flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    background: `${col.color}20`,
                    color: col.color,
                  }}
                >
                  {colOrders.length}
                </span>
              </div>

              {/* Order Cards */}
              <div className="flex flex-col gap-3">
                {colOrders.length === 0 ? (
                  <div
                    className="rounded-lg border border-dashed p-4 text-center text-sm"
                    style={{
                      borderColor: "var(--color-border)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    No orders
                  </div>
                ) : (
                  colOrders.map((order) => (
                    <div
                      key={order.id}
                      className={`glass rounded-xl p-4 animate-slide-up ${
                        order.estimatedReadyAt &&
                        (col.key === "PAID" || col.key === "PREPARING") &&
                        new Date(order.estimatedReadyAt).getTime() < Date.now()
                          ? "ring-1 ring-red-500/40"
                          : ""
                      }`}
                    >
                      {/* Queue Number */}
                      <div className="mb-3 flex items-start justify-between">
                        <div
                          className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold"
                          style={{
                            background: `${col.color}15`,
                            color: col.color,
                          }}
                        >
                          #{order.queueNumber || "—"}
                        </div>
                        {col.key === "AWAITING_CONFIRMATION" ? (
                          <OrderAgeBadge createdAt={order.createdAt} />
                        ) : (
                          <span className="text-xs text-[var(--color-text-muted)]">
                            {formatRelativeTime(new Date(order.createdAt))}
                          </span>
                        )}
                      </div>

                      {/* Customer */}
                      <p className="text-sm font-medium">{order.customerName}</p>

                      {/* Unconfirmed extras: payment method + proof thumbnail */}
                      {col.key === "AWAITING_CONFIRMATION" && (
                        <div className="mt-2 flex items-center gap-2">
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                            style={{ background: "var(--color-bg-tertiary)", color: "var(--color-text-secondary)" }}
                          >
                            {order.paymentMethod === "CASH" ? "Cash" : "QR"}
                          </span>
                          {order.hasProof ? (
                            <button
                              type="button"
                              onClick={() => setExpandedProofOrderId(order.id)}
                              className="rounded-lg border overflow-hidden shrink-0"
                              style={{ borderColor: "var(--color-border)" }}
                              aria-label="View payment receipt"
                            >
                              <img
                                src={`/api/orders/${order.id}/proof`}
                                alt="Payment receipt thumbnail"
                                className="h-10 w-10 object-cover"
                              />
                            </button>
                          ) : (
                            <span className="text-xs text-[var(--color-text-muted)]">No receipt yet</span>
                          )}
                        </div>
                      )}

                      {/* Items */}
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

                      {/* Notes */}
                      {order.notes && (
                        <p className="mt-2 rounded-md px-2 py-1 text-xs italic" style={{ background: "var(--color-warning-bg)", color: "var(--color-warning)" }}>
                          {order.notes}
                        </p>
                      )}

                      {/* Total */}
                      <div
                        className="mt-3 flex items-center justify-between border-t pt-3 text-sm font-semibold"
                        style={{ borderColor: "var(--color-border)" }}
                      >
                        <span>Total</span>
                        <span style={{ color: "var(--color-primary)" }}>
                          {formatPrice(order.total)}
                        </span>
                      </div>

                      {/* ETA + delay controls (active orders only) */}
                      {(col.key === "PAID" || col.key === "PREPARING") && (
                        <div className="mt-3 space-y-2">
                          {order.estimatedReadyAt && (() => {
                            const msLeft = new Date(order.estimatedReadyAt).getTime() - Date.now();
                            const overdue = msLeft < 0;
                            const mins = Math.ceil(Math.abs(msLeft) / 60_000);
                            return (
                              <p
                                className={`text-xs font-bold ${overdue ? "text-red-500" : "text-[var(--color-text-secondary)]"}`}
                              >
                                {overdue ? `Overdue by ${mins}m` : `Promised in ${mins}m`}
                                {order.delayReason ? ` · ${order.delayReason}` : ""}
                              </p>
                            );
                          })()}
                          <div className="flex gap-1.5">
                            {[5, 10, 20].map((m) => (
                              <button
                                key={m}
                                onClick={() => bumpOrderEta(order.id, m)}
                                className="flex-1 rounded-md border px-2 py-1 text-[10px] font-bold transition-colors hover:bg-[var(--color-bg-tertiary)]"
                                style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
                              >
                                +{m}m
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => updateOrderStatus(order.id, col.nextStatus, order.status)}
                          disabled={updatingOrderId !== null}
                          className="flex-1 rounded-lg py-2 text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                          style={{ background: col.color }}
                        >
                          {updatingOrderId === order.id ? "Updating…" : col.nextAction}
                        </button>
                        {col.rejectStatus && (
                          <button
                            onClick={() => rejectOrder(order)}
                            disabled={updatingOrderId !== null}
                            className="rounded-lg border px-3 py-2 text-xs transition-colors hover:bg-[var(--color-error-bg)] disabled:opacity-60 disabled:cursor-not-allowed"
                            style={{
                              borderColor: "var(--color-border)",
                              color: "var(--color-error)",
                            }}
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Full-size payment receipt viewer */}
      {expandedProofOrderId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setExpandedProofOrderId(null)}
        >
          <div
            className="glass w-full max-w-lg rounded-2xl p-4 shadow-2xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold">Payment Receipt</h2>
              <button
                onClick={() => setExpandedProofOrderId(null)}
                aria-label="Close"
                className="font-bold px-2"
              >
                ×
              </button>
            </div>
            <img
              src={`/api/orders/${expandedProofOrderId}/proof`}
              alt="Payment receipt full size"
              className="max-h-[70vh] w-full rounded-lg object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
