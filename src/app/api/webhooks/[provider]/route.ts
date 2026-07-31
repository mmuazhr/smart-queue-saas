// =============================================================================
// Unified Payment Webhook Handler
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { PaymentService } from "@/lib/payments/service";
import { NotificationService } from "@/lib/notifications/service";
import prisma from "@/lib/prisma";
import { getQueueDate } from "@/lib/queue";
import { logger } from "@/lib/logger";

interface FulfilledOrder {
  id: string;
  customerPhone: string;
  customerName: string;
  queueNumber: number;
  store: { name: string; slug: string };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  try {
    const result = await PaymentService.handleWebhook(provider, req);

    if (!result.isValid || !result.orderId) {
      logger.error(`Invalid webhook signature for ${provider}`);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    if (result.status !== "COMPLETED") {
      return NextResponse.json({ success: true });
    }

    const orderId = result.orderId;
    const today = getQueueDate();
    let fulfilled: FulfilledOrder | null = null;

    await prisma.$transaction(async (tx) => {
      // Fetch order inside transaction to get storeId + current status
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { storeId: true, status: true },
      });

      if (!order || order.status !== "PENDING_PAYMENT") {
        // Already processed — treat as idempotent success
        return;
      }

      // Atomically increment (or create) the daily queue counter
      const counter = await tx.dailyQueueCounter.upsert({
        where: {
          storeId_queueDate: { storeId: order.storeId, queueDate: today },
        },
        update: { lastQueueNumber: { increment: 1 } },
        create: { storeId: order.storeId, queueDate: today, lastQueueNumber: 1 },
      });

      // Atomic conditional update — only proceeds if still PENDING_PAYMENT
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: "PENDING_PAYMENT" },
        data: {
          status: "PAID",
          paymentStatus: "COMPLETED",
          paidAt: new Date(),
          queueNumber: counter.lastQueueNumber,
        },
      });

      if (updated.count === 0) {
        // Race: another invocation won — already processed
        return;
      }

      // Read the final state (with store slug) for the notification
      const finalOrder = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          customerPhone: true,
          customerName: true,
          queueNumber: true,
          store: { select: { name: true, slug: true } },
        },
      });

      if (finalOrder?.queueNumber != null) {
        fulfilled = finalOrder as FulfilledOrder;
      }
    });

    // Send notification OUTSIDE the transaction — a slow/failing SMS must never
    // roll back the DB write.
    if (fulfilled) {
      const f = fulfilled as FulfilledOrder;
      try {
        await NotificationService.sendOrderConfirmed({
          recipientPhone: f.customerPhone,
          customerName: f.customerName,
          storeName: f.store.name,
          orderNumber: f.queueNumber,
          // Use store slug (not storeId) — /store/<uuid>/... would 404
          orderUrl: `${process.env.NEXTAUTH_URL}/store/${f.store.slug}/order/${f.id}`,
        });
      } catch (notifErr) {
        logger.error(`Notification failed for order ${orderId} (non-fatal):`, notifErr);
      }
      logger.info(`Order ${orderId} fulfilled via ${provider}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(`Webhook Processing Error (${provider}):`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
