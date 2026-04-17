// =============================================================================
// Queue Engine — Core queue management logic
// =============================================================================

import prisma from "@/lib/prisma";

/**
 * Atomically assigns the next queue number for a store on the current date.
 * Uses a Prisma transaction with upsert to prevent duplicate numbers.
 */
export async function assignQueueNumber(storeId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await prisma.$transaction(async (tx) => {
    // Upsert the daily counter — create if not exists, increment if exists
    const counter = await tx.dailyQueueCounter.upsert({
      where: {
        storeId_queueDate: {
          storeId,
          queueDate: today,
        },
      },
      create: {
        storeId,
        queueDate: today,
        lastQueueNumber: 1,
      },
      update: {
        lastQueueNumber: { increment: 1 },
      },
    });

    return counter.lastQueueNumber;
  });

  return result;
}

/**
 * Calculates the estimated waiting time for a new order at a given queue position.
 *
 * Formula:
 *   ETA = ceil(ordersAhead / maxConcurrentOrders) × avgPrepTimeMins
 *
 * @param storeId - The store to calculate ETA for
 * @param queuePosition - How many orders are ahead (0 = next up)
 */
export async function calculateETA(
  storeId: string,
  queuePosition?: number
): Promise<number> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      avgPrepTimeMins: true,
      maxConcurrentOrders: true,
    },
  });

  if (!store) throw new Error(`Store ${storeId} not found`);

  // If queue position not provided, calculate from active orders
  let ordersAhead = queuePosition;
  if (ordersAhead === undefined) {
    ordersAhead = await prisma.order.count({
      where: {
        storeId,
        status: { in: ["PAID", "ACCEPTED", "PREPARING"] },
      },
    });
  }

  if (ordersAhead === 0) return store.avgPrepTimeMins;

  const batches = Math.ceil(ordersAhead / store.maxConcurrentOrders);
  return batches * store.avgPrepTimeMins;
}

/**
 * Gets the current queue position for a specific order.
 * Returns how many orders with lower queue numbers are still active.
 */
export async function getQueuePosition(orderId: string): Promise<number> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { storeId: true, queueNumber: true, status: true },
  });

  if (!order || !order.queueNumber) return 0;

  // Count orders ahead (lower queue number, still active)
  const ordersAhead = await prisma.order.count({
    where: {
      storeId: order.storeId,
      queueNumber: { lt: order.queueNumber },
      status: { in: ["PAID", "ACCEPTED", "PREPARING"] },
    },
  });

  return ordersAhead;
}
