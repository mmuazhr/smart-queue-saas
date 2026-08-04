// =============================================================================
// Order timer — the moving clock on a Kanban card, and how alarming it looks.
// =============================================================================
// Pure so the dashboard can re-render it every second: the caller owns the
// clock and passes `now`. Every card counts DOWN to the deadline that matters
// for its status (the acceptance window, the promised ETA, the pickup window)
// and keeps counting into the negative once that deadline passes. A card must
// never blow up the board over a missing or malformed timestamp, so every date
// is parsed defensively and an unreadable one degrades to "no information yet"
// (counting up from now, green).

export type TimerTone = "green" | "yellow" | "red";

export interface OrderTimerInput {
  status: string;
  createdAt: string | Date;
  readyAt?: string | Date | null;
  estimatedReadyAt?: string | Date | null;
}

const MS_PER_MIN = 60_000;
/** How long the merchant has to accept or reject a new order. */
const ACCEPTANCE_WINDOW_MINS = 3;
/** How long cooked food is expected to sit on the counter before pickup. */
const PICKUP_WINDOW_MINS = 5;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDuration(ms: number): string {
  const totalMins = Math.floor(ms / MS_PER_MIN);
  if (totalMins >= 60) {
    return `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`;
  }
  const secs = Math.floor((ms % MS_PER_MIN) / 1000);
  return `${totalMins}:${String(secs).padStart(2, "0")}`;
}

/** Time left on the clock; an overdue card renders its overrun as negative. */
function formatRemaining(remainingMs: number): string {
  const sign = remainingMs < 0 ? "-" : "";
  return `${sign}${formatDuration(Math.abs(remainingMs))}`;
}

/**
 * Time remaining on the card plus the colour it should wear. Each status
 * counts down to its own deadline: AWAITING_CONFIRMATION to the end of the
 * acceptance window, a confirmed order to its promised ETA, READY to the end
 * of the pickup window.
 */
export function orderTimer(
  order: OrderTimerInput,
  now: Date
): { label: string; tone: TimerTone } {
  const createdAt = toDate(order.createdAt);
  const nowMs = now.getTime();

  if (order.status === "READY") {
    // Cooked food going cold on the counter — the clock runs from when it was
    // marked ready, falling back to the order time if that stamp is missing.
    const base = toDate(order.readyAt) ?? createdAt ?? now;
    const remainingMs = base.getTime() + PICKUP_WINDOW_MINS * MS_PER_MIN - nowMs;
    const overdueMins = -remainingMs / MS_PER_MIN;
    return {
      label: formatRemaining(remainingMs),
      tone: remainingMs > 0 ? "green" : overdueMins <= PICKUP_WINDOW_MINS ? "yellow" : "red",
    };
  }

  if (order.status === "AWAITING_CONFIRMATION") {
    // An unanswered order is the customer standing there wondering whether the
    // shop saw it, so the window is short and its last minute is already yellow.
    const base = createdAt ?? now;
    const remainingMs = base.getTime() + ACCEPTANCE_WINDOW_MINS * MS_PER_MIN - nowMs;
    const remainingMins = remainingMs / MS_PER_MIN;
    return {
      label: formatRemaining(remainingMs),
      tone: remainingMins > 1 ? "green" : remainingMins >= 0 ? "yellow" : "red",
    };
  }

  const estimatedReadyAt = toDate(order.estimatedReadyAt);
  if (estimatedReadyAt) {
    // A promise was made to the customer — count down to it.
    const remainingMs = estimatedReadyAt.getTime() - nowMs;
    const remainingMins = remainingMs / MS_PER_MIN;
    return {
      label: formatRemaining(remainingMs),
      tone: remainingMins > 5 ? "green" : remainingMins >= 0 ? "yellow" : "red",
    };
  }

  // No deadline exists to count down to (the ETA is stamped at confirmation,
  // so this is rare). Age alone is the signal, and the chip counts up rather
  // than inventing a deadline it would then lie about.
  const base = createdAt ?? now;
  const elapsedMs = Math.max(0, nowMs - base.getTime());
  const elapsedMins = elapsedMs / MS_PER_MIN;
  return {
    label: formatDuration(elapsedMs),
    tone: elapsedMins < 2 ? "green" : elapsedMins <= 3 ? "yellow" : "red",
  };
}
