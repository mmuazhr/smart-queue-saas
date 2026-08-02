"use client";

// =============================================================================
// Analytics Dashboard — Professional Business Insights
// =============================================================================

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Clock, 
  DollarSign,
  ArrowUpRight,
  ChevronRight,
  RefreshCw,
  ShoppingBag,
  Lock
} from "lucide-react";
import { formatPrice } from "@/lib/utils";

type RangeKey = "today" | "7d" | "30d";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
];

const rangeLabel = (key: RangeKey) => RANGES.find((r) => r.key === key)?.label ?? "Today";

interface SeriesPoint {
  hour?: number;
  date?: string;
  label: string;
  count: number;
  revenue: number;
}

interface AnalyticsData {
  range: RangeKey;
  summary: {
    revenue: number;
    revenueChange: number | null;
    ordersCount: number;
    totalOrdersCount: number;
    averageOrderValue: number;
  };
  topItems: {
    name: string;
    quantity: number;
    revenue: number;
  }[];
  series: {
    granularity: "hourly" | "daily";
    points: SeriesPoint[];
  };
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [range, setRange] = useState<RangeKey>("today");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [frozen, setFrozen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch(`/api/dashboard/analytics?range=${range}`);
      const json = await res.json();
      setFrozen(json.code === "FROZEN");
      if (json.success) setData(json.data);
    } catch (err) {
      console.error("Failed to fetch analytics", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Labels track the range the loaded data actually covers, so a slow refetch
  // never pairs "30 Days" with today's numbers.
  const shownRange = data?.range ?? range;
  const shownLabel = rangeLabel(shownRange);
  const series = data?.series;
  const isDaily = series?.granularity === "daily";

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

  if (frozen) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="glass max-w-sm rounded-3xl p-10 text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15">
            <Lock className="h-7 w-7 text-amber-500" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">Analytics is available on a paid plan</h1>
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
            Your trial has ended, so reporting is paused while you&apos;re on limited
            mode. Contact us to activate your plan and get your insights back.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Analytics</h1>
          <p className="text-[var(--color-text-secondary)] text-sm">Real-time performance insights for your stall.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-xl glass" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                aria-pressed={range === r.key}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  range === r.key
                    ? "gradient-primary text-white"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)]"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl glass hover:bg-[var(--color-bg-tertiary)] transition-all text-xs font-bold"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Updating…" : "Refresh Data"}
          </button>
        </div>
      </div>

      {/* Top Level Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={`Revenue (${shownLabel})`}
          value={formatPrice(data?.summary.revenue || 0)}
          change={data?.summary.revenueChange ?? undefined}
          icon={<DollarSign className="h-5 w-5 text-green-500" />}
          delay={0}
        />
        <StatCard
          label={`Orders (${shownLabel})`}
          value={data?.summary.ordersCount.toString() || "0"}
          icon={<ShoppingBag className="h-5 w-5 text-orange-500" />}
          delay={1}
        />
        <StatCard
          label={`Avg. Order Value (${shownLabel})`}
          value={formatPrice(data?.summary.averageOrderValue || 0)}
          icon={<TrendingUp className="h-5 w-5 text-blue-500" />}
          delay={2}
        />
        <StatCard 
          label="Total All-Time" 
          value={data?.summary.totalOrdersCount.toString() || "0"} 
          icon={<Users className="h-5 w-5 text-purple-500" />}
          delay={3}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hourly Volume Chart */}
        <div className="lg:col-span-2 glass rounded-3xl p-6 border border-[var(--color-border)]">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold flex items-center gap-2">
              <Clock className="h-4 w-4 text-[var(--color-primary)]" />
              Order Volume ({shownLabel})
            </h3>
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
              {isDaily ? "By Day" : "By Hour"}
            </span>
          </div>
          <div className={`h-64 flex items-end relative ${isDaily ? "gap-0.5 sm:gap-1" : "gap-1 sm:gap-2"}`}>
            {series && series.points.every((p) => p.count === 0) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center opacity-40">
                <p className="text-sm">No orders in this period.</p>
                <p className="text-xs mt-1">
                  {isDaily ? "Daily" : "Hourly"} volume appears here as orders come in.
                </p>
              </div>
            )}
            {series?.points.map((p, i) => {
              const maxCount = Math.max(...series.points.map((d) => d.count), 1);
              const height = (p.count / maxCount) * 100;
              return (
                <div key={p.date ?? p.hour} className="flex-1 flex flex-col items-center group">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${height}%` }}
                    transition={{ delay: i * 0.02, duration: 0.8, ease: "easeOut" }}
                    className={`w-full rounded-t-sm sm:rounded-t-md transition-all ${p.count > 0 ? "gradient-primary" : "bg-[var(--color-bg-tertiary)] opacity-20"}`}
                  />
                  <div className="mt-2 text-[8px] sm:text-[10px] text-[var(--color-text-muted)] hidden group-hover:block absolute -top-8 bg-zinc-900 text-white px-2 py-1 rounded whitespace-nowrap">
                    {p.label} · {p.count} orders
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-4 px-1 text-[10px] font-bold text-[var(--color-text-muted)] italic">
            {isDaily && series ? (
              <>
                <span>{series.points[0]?.label}</span>
                <span>{series.points[Math.floor(series.points.length / 2)]?.label}</span>
                <span>{series.points[series.points.length - 1]?.label}</span>
              </>
            ) : (
              <>
                <span>Morning</span>
                <span>Afternoon</span>
                <span>Evening</span>
              </>
            )}
          </div>
        </div>

        {/* Top Items */}
        <div className="glass rounded-3xl p-6 border border-[var(--color-border)]">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold">Popular Items ({shownLabel})</h3>
            <BarChart3 className="h-4 w-4 text-[var(--color-text-muted)]" />
          </div>
          <div className="space-y-6">
            {data?.topItems.map((item, i) => {
              const maxQty = Math.max(...data.topItems.map(it => it.quantity), 1);
              const percent = (item.quantity / maxQty) * 100;
              return (
                <motion.div 
                  key={item.name}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  className="space-y-2"
                >
                  <div className="flex justify-between text-sm">
                    <span className="font-medium truncate pr-2">{item.name}</span>
                    <span className="font-bold">{item.quantity} sales</span>
                  </div>
                  <div className="h-1.5 w-full bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${percent}%` }}
                      transition={{ delay: 1 + i * 0.1, duration: 1 }}
                      className="h-full gradient-primary"
                    />
                  </div>
                  <div className="flex justify-end">
                    <span className="text-[10px] text-[var(--color-text-muted)]">{formatPrice(item.revenue)} total</span>
                  </div>
                </motion.div>
              );
            })}
            {(!data?.topItems || data.topItems.length === 0) && (
              <div className="h-full flex flex-col items-center justify-center opacity-40 py-12">
                <p className="text-sm">No sales data yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, change, icon, delay }: { label: string, value: string, change?: number, icon: ReactNode, delay: number }) {
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
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-black ${change >= 0 ? "text-green-500" : "text-red-500"}`}>
            {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(change)}%
            {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : null}
          </div>
        )}
      </div>
      <p className="text-[var(--color-text-muted)] text-[10px] font-black uppercase tracking-widest">{label}</p>
      <h4 className="text-2xl font-black mt-1">{value}</h4>
    </motion.div>
  );
}
