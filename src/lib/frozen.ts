// =============================================================================
// Frozen mode — limited free tier for merchants whose trial has ended.
// =============================================================================
// A frozen merchant keeps a live storefront but may sell only one menu item and
// may hold only a handful of active orders. The storefront and the order API
// must agree on exactly which item that is, so both call
// firstAvailableMenuItemId() rather than each deriving its own answer:
// sortOrder defaults to 0 everywhere, so any partial ordering is ambiguous.

import prisma from "@/lib/prisma";

export const FROZEN_ORDER_CAP = 5;

// AWAITING_CONFIRMATION is deliberately excluded: an unconfirmed order occupies
// no kitchen capacity, and counting it would let anyone jam a frozen store by
// abandoning five checkouts. Capacity is what the merchant has actually taken on.
export const FROZEN_ACTIVE_ORDER_STATUSES = ["PAID", "ACCEPTED", "PREPARING", "READY"] as const;

/**
 * The single item a frozen store may sell: the first orderable item under the
 * ordering the storefront renders (categories, then item sort order), with ids
 * as the final tiebreak so the result is stable across requests. Items in an
 * inactive category are excluded — the storefront never shows them.
 */
export async function firstAvailableMenuItemId(storeId: string): Promise<string | null> {
  const item = await prisma.menuItem.findFirst({
    where: {
      storeId,
      isAvailable: true,
      OR: [{ categoryId: null }, { category: { isActive: true } }],
    },
    orderBy: [
      { category: { sortOrder: "asc" } },
      { category: { id: "asc" } },
      { sortOrder: "asc" },
      { id: "asc" },
    ],
    select: { id: true },
  });
  return item?.id ?? null;
}
