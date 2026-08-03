// =============================================================================
// Order timer — the moving clock on a Kanban card, and how alarming it looks.
// =============================================================================
// Pure so the dashboard can re-render it every second: the caller owns the
// clock and passes `now`. A card must never blow up the board over a missing
// or malformed timestamp, so every date is parsed defensively and an
// unreadable one degrades to "no information yet" (elapsed from now, green).

export type TimerTone = "green" | "yellow" | "red";

export interface OrderTimerInput {
  status: string;
  createdAt: string | Date;
  readyAt?: string | Date | null;
  estimatedReadyAt?: string | Date | null;
}

const MS_PER_MIN = 60_000;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatElapsed(elapsedMs: number): string {
  const totalMins = Math.floor(elapsedMs / MS_PER_MIN);
  if (totalMins >= 60) {
    return `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`;
  }
  const secs = Math.floor((elapsedMs % MS_PER_MIN) / 1000);
  return `${totalMins}:${String(secs).padStart(2, "0")}`;
}

/**
 * Elapsed time on the card plus the colour it should wear. READY orders are
 * timed from when they were marked ready (how long the customer has been kept
 * waiting at the counter); everything else from when the order came in.
 */
export function orderTimer(
  order: OrderTimerInput,
  now: Date
): { label: string; tone: TimerTone } {
  const createdAt = toDate(order.createdAt);
  const isReady = order.status === "READY";
  const base = (isReady ? toDate(order.readyAt) ?? createdAt : createdAt) ?? now;

  // A clock skewed into the future must not render a negative timer.
  const elapsedMs = Math.max(0, now.getTime() - base.getTime());
  const elapsedMins = elapsedMs / MS_PER_MIN;
  const label = formatElapsed(elapsedMs);

  if (isReady) {
    // Cooked food going cold on the counter.
    return { label, tone: elapsedMins < 5 ? "green" : elapsedMins <= 10 ? "yellow" : "red" };
  }

  const estimatedReadyAt = toDate(order.estimatedReadyAt);
  if (estimatedReadyAt) {
    // A promise was made to the customer — colour by how close it is.
    const remainingMins = (estimatedReadyAt.getTime() - now.getTime()) / MS_PER_MIN;
    return { label, tone: remainingMins > 5 ? "green" : remainingMins >= 0 ? "yellow" : "red" };
  }

  // No promise yet (typically unconfirmed): age alone is the signal.
  return { label, tone: elapsedMins < 3 ? "green" : elapsedMins <= 7 ? "yellow" : "red" };
}
