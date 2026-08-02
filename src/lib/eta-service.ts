// =============================================================================
// ETA Service — DB-backed store stats for the ETA engine, cached in-memory
// for 30s so the 3-second SSE poll stays cheap. Same in-process cache
// approach as rate-limit.ts; fine on the single Railway node.
// =============================================================================

import prisma from "@/lib/prisma";
import {
  computeStoreStats,
  computeEtaMins,
  ETA_STATS_WINDOW_MS,
  type StoreEtaStats,
} from "@/lib/eta";
import { logger } from "@/lib/logger";

const CACHE_TTL_MS = 30_000;

export interface StoreEtaContext {
  stats: StoreEtaStats;
  avgPrepTimeMins: number;
  maxConcurrentOrders: number;
  queueDelayMins: number;
  queueDelayReason: string | null;
}

const cache = new Map<string, { ctx: StoreEtaContext; expiresAt: number }>();

export function invalidateEtaCache(storeId: string): void {
  cache.delete(storeId);
}

export async function getStoreEtaContext(
  storeId: string
): Promise<StoreEtaContext | null> {
  const hit = cache.get(storeId);
  if (hit && hit.expiresAt > Date.now()) return hit.ctx;

  const now = new Date();
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      avgPrepTimeMins: true,
      maxConcurrentOrders: true,
      queueDelayMins: true,
      queueDelayReason: true,
    },
  });
  if (!store) return null;

  const readyRows = await prisma.order.findMany({
    where: {
      storeId,
      readyAt: { gte: new Date(now.getTime() - ETA_STATS_WINDOW_MS) },
    },
    select: { readyAt: true, preparingAt: true, confirmedAt: true, paidAt: true },
  });

  // Prep is measured from when cooking actually started; confirmedAt/paidAt
  // are fallbacks for legacy rows that skipped straight to READY.
  const samples = readyRows.flatMap((r) => {
    const startedAt = r.preparingAt ?? r.confirmedAt ?? r.paidAt;
    return r.readyAt && startedAt ? [{ readyAt: r.readyAt, startedAt }] : [];
  });

  const ctx: StoreEtaContext = {
    stats: computeStoreStats(samples, now),
    avgPrepTimeMins: store.avgPrepTimeMins,
    maxConcurrentOrders: store.maxConcurrentOrders,
    queueDelayMins: store.queueDelayMins,
    queueDelayReason: store.queueDelayReason,
  };
  cache.set(storeId, { ctx, expiresAt: Date.now() + CACHE_TTL_MS });
  return ctx;
}

/**
 * Estimate for an order being confirmed right now. Returns null on any
 * failure — an estimate must never block a confirmation.
 */
export async function estimateForNewOrder(storeId: string): Promise<number | null> {
  try {
    const ctx = await getStoreEtaContext(storeId);
    if (!ctx) return null;
    const ordersAhead = await prisma.order.count({
      where: { storeId, status: { in: ["PAID", "ACCEPTED", "PREPARING"] } },
    });
    return computeEtaMins({
      ordersAhead,
      stats: ctx.stats,
      fallbackPrepMins: ctx.avgPrepTimeMins,
      maxConcurrentOrders: ctx.maxConcurrentOrders,
      queueDelayMins: ctx.queueDelayMins,
    });
  } catch (error) {
    logger.error("ETA estimate failed (non-fatal):", error);
    return null;
  }
}
