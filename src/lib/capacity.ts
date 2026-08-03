// =============================================================================
// Queue capacity — how full a store's queue is against its own
// maxConcurrentOrders setting.
// =============================================================================
// Unconfirmed orders count here (unlike FROZEN_ACTIVE_ORDER_STATUSES, which
// measures work the merchant has actually taken on): a queue that is full of
// pending confirmations is still a queue the shop has to work through, and the
// customer should be told before they place an order they will wait on. READY
// orders are excluded — they are cooked and waiting for pickup, not capacity.

export const QUEUE_ACTIVE_STATUSES = [
  "AWAITING_CONFIRMATION",
  "PAID",
  "ACCEPTED",
  "PREPARING",
] as const;

/** The cap is inclusive: a store at exactly maxConcurrentOrders takes no more. */
export function isQueueFull(activeCount: number, maxConcurrentOrders: number): boolean {
  return activeCount >= maxConcurrentOrders;
}
