// =============================================================================
// Serializers — convert Prisma Decimal fields to plain JS numbers before sending
// to clients.  Prisma Decimal does not JSON-serialize as a number natively.
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

export function toPlainOrderItem(item: AnyRecord): AnyRecord {
  return {
    ...item,
    itemPrice: Number(item.itemPrice),
    lineTotal: Number(item.lineTotal),
  };
}

export function toPlainOrder(order: AnyRecord): AnyRecord {
  return {
    ...order,
    subtotal: Number(order.subtotal),
    tax: Number(order.tax),
    total: Number(order.total),
    orderItems: Array.isArray(order.orderItems)
      ? order.orderItems.map(toPlainOrderItem)
      : order.orderItems,
  };
}

export function toPlainMenuItem(item: AnyRecord): AnyRecord {
  return {
    ...item,
    price: Number(item.price),
  };
}
