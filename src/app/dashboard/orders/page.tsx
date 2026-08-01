"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, Filter, Calendar, ChevronRight, ChevronDown, CheckCircle2, XCircle, Clock, Package, MessageSquare } from "lucide-react";
import { formatPrice, formatRelativeTime, displayOrderStatus } from "@/lib/utils";

interface OrderItem {
  id: string;
  itemName: string;
  itemPrice: number;
  quantity: number;
  lineTotal: number;
  specialInstructions: string | null;
}

interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  queueNumber: number | null;
  status: string;
  total: number;
  createdAt: string;
  notes: string | null;
  orderItems: OrderItem[];
}

export default function OrderHistoryPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [noStore, setNoStore] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/stores");
        const data = await res.json();
        if (data.success && data.data.length > 0) {
          setStoreId(data.data[0].id);
        } else {
          // No store yet — stop the spinner and show the create-store pointer
          setNoStore(true);
          setLoading(false);
        }
      } catch (error) {
        console.error("Failed to fetch store:", error);
      }
    }
    init();
  }, []);

  useEffect(() => {
    async function fetchOrders() {
      if (!storeId) return;
      try {
        const url = `/api/orders?storeId=${storeId}${filterStatus !== "ALL" ? `&status=${filterStatus}` : ""}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.success) {
          setOrders(data.data);
        }
      } catch (error) {
        console.error("Failed to fetch orders:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, [storeId, filterStatus]);

  const filteredOrders = orders.filter(order => 
    order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.customerPhone.includes(searchQuery) ||
    order.queueNumber?.toString().includes(searchQuery)
  );

  function getStatusStyle(status: string) {
    switch (displayOrderStatus(status)) {
      case "COMPLETED": return "bg-green-500/10 text-green-500 border-green-500/20";
      case "CANCELLED": return "bg-red-500/10 text-red-500 border-red-500/20";
      case "READY": return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "PREPARING": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "ACCEPTED": return "bg-indigo-500/10 text-indigo-500 border-indigo-500/20";
      default: return "bg-zinc-500/10 text-zinc-500 border-zinc-500/20";
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case "COMPLETED": return <CheckCircle2 className="h-3.5 w-3.5" />;
      case "CANCELLED": return <XCircle className="h-3.5 w-3.5" />;
      default: return <Clock className="h-3.5 w-3.5" />;
    }
  }

  if (noStore) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">
          You don&apos;t have a store yet — orders will appear here once your store is live.
        </p>
        <Link href="/dashboard/settings" className="rounded-xl gradient-primary px-5 py-2.5 text-sm font-bold text-white">
          Create your store
        </Link>
      </div>
    );
  }
  if (loading) return <div className="flex h-64 items-center justify-center animate-pulse-glow">Loading History...</div>;

  return (
    <div className="animate-fade-in max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Order History</h1>
        <p className="text-sm text-[var(--color-text-muted)]">View and manage past customer orders</p>
      </div>

      {/* Filters Bar */}
      <div className="glass rounded-2xl p-4 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
          <input 
            type="text" 
            placeholder="Search by name, phone or #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-[var(--color-border)] glass text-sm focus:ring-2 focus:ring-[var(--color-primary)] transition-all"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--color-border)] glass">
            <Filter className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-transparent text-sm font-medium outline-none"
            >
              <option value="ALL">All Status</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="READY">Ready</option>
              <option value="PREPARING">Preparing</option>
              <option value="PAID,ACCEPTED">Accepted</option>
            </select>
          </div>
          <button className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--color-border)] glass text-sm font-medium hover:bg-[var(--color-bg-tertiary)] transition-all">
            <Calendar className="h-3.5 w-3.5" />
            Today
          </button>
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-20 glass rounded-2xl border-dashed">
            <Package className="h-12 w-12 text-[var(--color-text-muted)] mx-auto mb-4 opacity-20" />
            <p className="text-[var(--color-text-muted)]">No orders found matching your filters.</p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <div key={order.id} className="glass rounded-2xl overflow-hidden border border-[var(--color-border)] hover:border-[var(--color-primary-muted)] transition-all">
              <div 
                onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                className="p-4 flex flex-wrap items-center gap-4 cursor-pointer hover:bg-white/[0.02]"
              >
                <div className="h-12 w-12 rounded-xl gradient-primary flex items-center justify-center text-white font-bold text-lg shadow-lg">
                  #{order.queueNumber || "?"}
                </div>
                
                <div className="flex-1 min-w-[150px]">
                  <h3 className="font-semibold text-[var(--color-text)]">{order.customerName}</h3>
                  <p className="text-xs text-[var(--color-text-muted)]">{order.customerPhone}</p>
                </div>

                <div className="hidden lg:block text-right px-6">
                  <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium">Items</p>
                  <p className="font-medium">{order.orderItems.length} items</p>
                </div>

                <div className="hidden md:block text-right px-6">
                  <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium">Ordered</p>
                  <p className="text-sm">{formatRelativeTime(new Date(order.createdAt))}</p>
                </div>

                <div className="text-right px-4">
                  <p className="text-sm font-bold text-[var(--color-primary)]">{formatPrice(order.total)}</p>
                </div>

                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${getStatusStyle(order.status)}`}>
                  {getStatusIcon(order.status)}
                  {displayOrderStatus(order.status)}
                </div>

                <div className="ml-2">
                  {expandedOrder === order.id ? <ChevronDown className="h-5 w-5 opacity-40" /> : <ChevronRight className="h-5 w-5 opacity-40" />}
                </div>
              </div>

              {/* Expanded Details */}
              {expandedOrder === order.id && (
                <div className="px-4 pb-6 pt-2 border-t border-[var(--color-border)] animate-slide-down">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <h4 className="text-xs font-bold uppercase text-[var(--color-text-muted)] tracking-widest mb-3">Order Details</h4>
                      <div className="space-y-2">
                        {order.orderItems.map((item) => (
                          <div key={item.id} className="flex justify-between text-sm py-2 border-b border-[var(--color-border)] last:border-0 border-dashed">
                            <div className="flex gap-3">
                              <span className="font-bold text-[var(--color-primary)]">x{item.quantity}</span>
                              <div>
                                <p className="font-medium">{item.itemName}</p>
                                {item.specialInstructions && (
                                  <p className="text-[10px] text-amber-500 flex items-center gap-1 mt-0.5">
                                    <MessageSquare className="h-3 w-3" /> {item.specialInstructions}
                                  </p>
                                )}
                              </div>
                            </div>
                            <span className="text-[var(--color-text-muted)]">{formatPrice(item.lineTotal)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white/[0.02] rounded-xl p-4 border border-[var(--color-border)]">
                      <h4 className="text-xs font-bold uppercase text-[var(--color-text-muted)] tracking-widest mb-3">Customer Notes</h4>
                      <p className="text-sm italic text-[var(--color-text-secondary)]">
                        {order.notes || "No additional notes from customer."}
                      </p>
                      
                      <div className="mt-6 pt-4 border-t border-[var(--color-border)]">
                        <div className="flex justify-between text-xs text-[var(--color-text-muted)] mb-1">
                          <span>Order ID</span>
                          <span className="font-mono">{order.id.slice(0, 8)}...</span>
                        </div>
                        <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
                          <span>Created At</span>
                          <span>{new Date(order.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
