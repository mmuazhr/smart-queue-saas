// =============================================================================
// Unified Payment Webhook Handler
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { PaymentService } from "@/lib/payments/service";
import { NotificationService } from "@/lib/notifications/service";
import prisma from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  try {
    const result = await PaymentService.handleWebhook(provider, req);

    if (!result.isValid || !result.orderId) {
      console.error(`Invalid webhook signature for ${provider}`);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    if (result.status === "COMPLETED") {
      // 1. Process Order Fulfillment
      await prisma.$transaction(async (tx) => {
        // Fetch current order
        const order = await tx.order.findUnique({
          where: { id: result.orderId },
        });

        if (!order || order.status !== "PENDING_PAYMENT") {
          return; // Already processed or invalid
        }

        // 2. Assign Queue Number
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const counter = await tx.dailyQueueCounter.upsert({
          where: {
            storeId_queueDate: {
              storeId: order.storeId,
              queueDate: today,
            },
          },
          update: { lastQueueNumber: { increment: 1 } },
          create: {
            storeId: order.storeId,
            queueDate: today,
            lastQueueNumber: 1,
          },
        });

        // 3. Update Order Status
        const updatedOrder = await tx.order.update({
          where: { id: result.orderId },
          data: {
            status: "PAID",
            paymentStatus: "COMPLETED",
            paidAt: new Date(),
            queueNumber: counter.lastQueueNumber,
          },
          include: { store: true }
        });

        // 4. Trigger Notification (Phase 5)
        await NotificationService.sendOrderConfirmed({
          recipientPhone: order.customerPhone,
          customerName: order.customerName,
          storeName: updatedOrder.store.name,
          orderNumber: counter.lastQueueNumber,
          orderUrl: `${process.env.NEXTAUTH_URL}/store/${order.storeId}/order/${order.id}`
        });
      });

      console.log(`Order ${result.orderId} fulfilled via ${provider}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Webhook Processing Error (${provider}):`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
