"use client";

// =============================================================================
// Admin Overview — platform-wide metrics
// =============================================================================

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Store,
  Users,
  CheckCircle2,
  ShoppingBag,
  CalendarDays,
  DollarSign,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";

interface OverviewData {
  merchants: number;
  stores: number;
  activeStores: number;
  ordersToday: number;
  orders7d: number;
  gmvToday: number;
  gmv7d: number;
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(false);
      const res = await fetch("/api/admin/overview");
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Request failed");
      setData(json.data);
    } catch (err) {
      console.error("Failed to fetch admin overview", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <RefreshCw className="h-8 w-8 text-[var(--color-primary)] opacity-40" />
        </motion.div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="glass rounded-3xl p-8 border border-[var(--color-border)] text-center max-w-sm">
          <h2 className="text-lg font-bold">Could not load metrics</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Something went wrong fetching platform metrics.
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
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Overview</h1>
          <p className="text-[var(--color-text-secondary)] text-sm">Platform-wide activity across every merchant.</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 rounded-xl glass hover:bg-[var(--color-bg-tertiary)] transition-all text-xs font-bold"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh Data
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Merchants" value={data.merchants.toString()} icon={<Users className="h-5 w-5 text-purple-500" />} delay={0} />
        <StatCard label="Stores" value={data.stores.toString()} icon={<Store className="h-5 w-5 text-blue-500" />} delay={1} />
        <StatCard label="Active Stores" value={data.activeStores.toString()} icon={<CheckCircle2 className="h-5 w-5 text-green-500" />} delay={2} />
        <StatCard label="Orders Today" value={data.ordersToday.toString()} icon={<ShoppingBag className="h-5 w-5 text-orange-500" />} delay={3} />
        <StatCard label="Orders (7 Days)" value={data.orders7d.toString()} icon={<CalendarDays className="h-5 w-5 text-amber-500" />} delay={4} />
        <StatCard label="GMV Today" value={formatPrice(data.gmvToday)} icon={<DollarSign className="h-5 w-5 text-green-500" />} delay={5} />
        <StatCard label="GMV (7 Days)" value={formatPrice(data.gmv7d)} icon={<TrendingUp className="h-5 w-5 text-blue-500" />} delay={6} />
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, delay }: { label: string; value: string; icon: React.ReactNode; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.1 }}
      className="glass rounded-2xl p-6 border border-[var(--color-border)] hover:border-[var(--color-primary)]/30 transition-all group"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="h-10 w-10 rounded-xl bg-[var(--color-bg-tertiary)] flex items-center justify-center border border-[var(--color-border)] group-hover:scale-110 transition-transform">
          {icon}
        </div>
      </div>
      <p className="text-[var(--color-text-muted)] text-[10px] font-black uppercase tracking-widest">{label}</p>
      <h4 className="text-2xl font-black mt-1">{value}</h4>
    </motion.div>
  );
}
