// =============================================================================
// Queue Engine — Core queue management logic
// =============================================================================

import prisma from "@/lib/prisma";

const MALAYSIA_TZ = "Asia/Kuala_Lumpur";

/**
 * Returns the start of the current day in Asia/Kuala_Lumpur as a UTC Date.
 * Queue numbers reset at Malaysian midnight regardless of server timezone.
 */
export function getQueueDate(): Date {
  // en-CA gives YYYY-MM-DD format in the target timezone
  const mytDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: MALAYSIA_TZ,
  }).format(new Date());

  // Midnight MYT expressed as a fixed-offset ISO string → UTC Date
  return new Date(`${mytDateStr}T00:00:00+08:00`);
}

/**
 * Atomically assigns the next queue number for a store on the current date.
 * Uses a Prisma transaction with upsert to prevent duplicate numbers.
 */
export async function assignQueueNumber(storeId: string): Promise<number> {
  const today = getQueueDate();

  const result = await prisma.$transaction(async (tx) => {
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
 */
export async function getQueuePosition(orderId: string): Promise<number> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { storeId: true, queueNumber: true, status: true },
  });

  if (!order || !order.queueNumber) return 0;

  const ordersAhead = await prisma.order.count({
    where: {
      storeId: order.storeId,
      queueNumber: { lt: order.queueNumber },
      status: { in: ["PAID", "ACCEPTED", "PREPARING"] },
    },
  });

  return ordersAhead;
}
