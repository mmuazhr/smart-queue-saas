// =============================================================================
// ETA Engine — pure wait-time math. No I/O; callers supply the data.
//
// Model: ETA = (orders ahead ÷ measured throughput) + own prep time
//            + per-order manual bump + store-wide delay.
// Throughput and avg prep come from orders marked READY in the trailing
// window; below the sample floor we fall back to the legacy batch model
// (ceil(ahead / maxConcurrentOrders) × prep) driven by store settings.
// =============================================================================

export const ETA_STATS_WINDOW_MS = 60 * 60 * 1000;
export const MIN_THROUGHPUT_SAMPLES = 3;
export const DELAY_MIN_DRIFT_MINS = 3;
export const DELAY_DRIFT_RATIO = 0.2;

export interface StoreEtaStats {
  throughputPerMin: number | null;
  avgPrepMins: number | null;
  samples: number;
}

export function computeStoreStats(
  readyOrders: { readyAt: Date; startedAt: Date }[],
  now: Date
): StoreEtaStats {
  const cutoff = now.getTime() - ETA_STATS_WINDOW_MS;
  const recent = readyOrders.filter((o) => o.readyAt.getTime() >= cutoff);
  if (recent.length < MIN_THROUGHPUT_SAMPLES) {
    return { throughputPerMin: null, avgPrepMins: null, samples: recent.length };
  }

  const prepTotalMs = recent.reduce(
    (sum, o) => sum + Math.max(0, o.readyAt.getTime() - o.startedAt.getTime()),
    0
  );
  const earliestReady = Math.min(...recent.map((o) => o.readyAt.getTime()));
  const spanMins = Math.max(1, (now.getTime() - earliestReady) / 60_000);

  return {
    throughputPerMin: recent.length / spanMins,
    avgPrepMins: Math.max(1, prepTotalMs / recent.length / 60_000),
    samples: recent.length,
  };
}

export interface EtaInputs {
  ordersAhead: number;
  stats: StoreEtaStats;
  fallbackPrepMins: number;
  maxConcurrentOrders: number;
  etaAdjustMins?: number;
  queueDelayMins?: number;
}

export function computeEtaMins(inputs: EtaInputs): number {
  const { ordersAhead, stats, fallbackPrepMins, maxConcurrentOrders } = inputs;
  const prep = stats.avgPrepMins ?? fallbackPrepMins;
  const clearance =
    stats.throughputPerMin != null
      ? ordersAhead / stats.throughputPerMin
      : Math.ceil(ordersAhead / Math.max(1, maxConcurrentOrders)) * prep;
  const total =
    clearance + prep + (inputs.etaAdjustMins ?? 0) + (inputs.queueDelayMins ?? 0);
  return Math.max(1, Math.ceil(total));
}

export function projectReadyAt(
  order: {
    status: string;
    preparingAt: Date | null;
    confirmedAt: Date | null;
    etaAdjustMins: number;
  },
  ordersAhead: number,
  stats: StoreEtaStats,
  fallbackPrepMins: number,
  maxConcurrentOrders: number,
  now: Date
): Date {
  const prep = stats.avgPrepMins ?? fallbackPrepMins;
  if (order.status === "PREPARING" && order.preparingAt) {
    const done =
      order.preparingAt.getTime() + (prep + order.etaAdjustMins) * 60_000;
    return new Date(Math.max(now.getTime() + 60_000, done));
  }
  const mins = computeEtaMins({
    ordersAhead,
    stats,
    fallbackPrepMins,
    maxConcurrentOrders,
    etaAdjustMins: order.etaAdjustMins,
  });
  // Anchored to the confirmation instant, not `now`: `now` moves on every
  // poll while the order sits queued, which would ratchet the projection
  // (and the promise it's compared against in shouldRevise) forward on
  // wall-clock alone with no change in queue state.
  const base = order.confirmedAt ?? now;
  return new Date(base.getTime() + mins * 60_000);
}

/**
 * The promise only moves when the projection drifts past it by more than
 * max(3 minutes, 20% of the original estimate) — revising on every tick
 * would thrash the customer's countdown.
 */
export function shouldRevise(
  promisedReadyAt: Date,
  projectedReadyAt: Date,
  originalWaitMins: number | null
): boolean {
  const thresholdMs =
    Math.max(DELAY_MIN_DRIFT_MINS, (originalWaitMins ?? 0) * DELAY_DRIFT_RATIO) *
    60_000;
  return projectedReadyAt.getTime() - promisedReadyAt.getTime() > thresholdMs;
}

/**
 * Delayed = the current promise has moved more than a minute past the
 * original one (estimatedWaitMins is stamped once at confirmation and
 * never updated, so the delta IS the delay).
 */
export function isDelayed(
  confirmedAt: Date | null,
  estimatedWaitMins: number | null,
  estimatedReadyAt: Date | null
): boolean {
  if (!confirmedAt || estimatedWaitMins == null || !estimatedReadyAt) return false;
  const originalReadyAt = confirmedAt.getTime() + estimatedWaitMins * 60_000;
  return estimatedReadyAt.getTime() - originalReadyAt > 60_000;
}

export function remainingMins(estimatedReadyAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((estimatedReadyAt.getTime() - now.getTime()) / 60_000));
}
