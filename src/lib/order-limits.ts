// =============================================================================
// Per-order quantity limits — shared clamp + validation for menu item min/max
// Used by the menu API schemas, the dashboard form, the cart stepper and the
// order creation endpoint, so one rule change lands everywhere at once.
// =============================================================================

export interface QtyLimits {
  minOrderQty?: number | null;
  maxOrderQty?: number | null;
}

// createOrderItemSchema caps an ordered quantity at 99, so a limit above that
// could never be satisfied — the item would be permanently unorderable.
export const MAX_QTY_LIMIT = 99;

// Quantity the stepper starts at when an item is first added to the cart.
export function initialQuantity(limits: QtyLimits): number {
  return limits.minOrderQty ?? 1;
}

export function clampQuantity(quantity: number, limits: QtyLimits): number {
  const min = limits.minOrderQty ?? 1;
  const max = limits.maxOrderQty ?? Number.POSITIVE_INFINITY;
  return Math.max(min, Math.min(max, quantity));
}

// Bound checks are false when the limit is unset, so an item without a minimum
// keeps the existing "step down to zero to remove it" behaviour.
export function isAtMinQuantity(quantity: number, limits: QtyLimits): boolean {
  return limits.minOrderQty != null && quantity <= limits.minOrderQty;
}

export function isAtMaxQuantity(quantity: number, limits: QtyLimits): boolean {
  return limits.maxOrderQty != null && quantity >= limits.maxOrderQty;
}

// Muted hint shown on the storefront, e.g. "Min 3 · Max 10".
export function quantityLimitHint(limits: QtyLimits): string | null {
  const parts: string[] = [];
  if (limits.minOrderQty != null) parts.push(`Min ${limits.minOrderQty}`);
  if (limits.maxOrderQty != null) parts.push(`Max ${limits.maxOrderQty}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// Cross-field rule. Shared by the zod schema, the menu item PUT route (which
// merges the request with the stored bounds) and the dashboard form.
export function qtyLimitRangeError(
  minOrderQty: number | null | undefined,
  maxOrderQty: number | null | undefined
): string | null {
  if (minOrderQty == null || maxOrderQty == null) return null;
  return maxOrderQty < minOrderQty
    ? "Max per order must be greater than or equal to min per order"
    : null;
}

function boundError(value: number | null | undefined, label: string): string | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 1) return `${label} must be a whole number of at least 1`;
  if (value > MAX_QTY_LIMIT) return `${label} cannot be more than ${MAX_QTY_LIMIT}`;
  return null;
}

// Full client-side mirror of the API rules for the dashboard modal.
export function menuItemLimitsError(
  minOrderQty: number | null | undefined,
  maxOrderQty: number | null | undefined
): string | null {
  return (
    boundError(minOrderQty, "Min per order") ??
    boundError(maxOrderQty, "Max per order") ??
    qtyLimitRangeError(minOrderQty, maxOrderQty)
  );
}

export function quantityLimitViolation(
  itemName: string,
  quantity: number,
  limits: QtyLimits
): string | null {
  if (limits.minOrderQty != null && quantity < limits.minOrderQty) {
    return `${itemName} has a minimum of ${limits.minOrderQty} per order.`;
  }
  if (limits.maxOrderQty != null && quantity > limits.maxOrderQty) {
    return `${itemName} has a maximum of ${limits.maxOrderQty} per order.`;
  }
  return null;
}

// Limits apply per order, not per cart line, so quantities are summed by item
// before being checked.
export function cartLimitViolations(
  items: ReadonlyArray<QtyLimits & { menuItemId: string; name: string; quantity: number }>
): string[] {
  const totals = new Map<string, QtyLimits & { name: string; quantity: number }>();
  for (const item of items) {
    const seen = totals.get(item.menuItemId);
    totals.set(item.menuItemId, {
      name: item.name,
      minOrderQty: item.minOrderQty,
      maxOrderQty: item.maxOrderQty,
      quantity: (seen?.quantity ?? 0) + item.quantity,
    });
  }

  return [...totals.values()]
    .map((item) => quantityLimitViolation(item.name, item.quantity, item))
    .filter((message): message is string => message !== null);
}
