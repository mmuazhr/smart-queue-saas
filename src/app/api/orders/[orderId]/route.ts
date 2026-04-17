// =============================================================================
// Order Detail API Route — Get Single Order for Tracking
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { NotificationService } from "@/lib/notifications/service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        store: {
          select: {
            name: true,
            address: true,
            phone: true,
          },
        },
        orderItems: true,
      },
    });

    if (!order) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    console.error("Fetch order error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  
  try {
    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ success: false, error: "Status is required" }, { status: 400 });
    }

    const order = await prisma.order.update({
      where: { id: orderId },
      data: { 
        status,
        ...(status === 'READY' ? { readyAt: new Date() } : {}),
        ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}),
        ...(status === 'ACCEPTED' ? { acceptedAt: new Date() } : {}),
        ...(status === 'PREPARING' ? { preparingAt: new Date() } : {}),
      },
      include: { store: true }
    });

    // Notify customer if order is READY
    if (status === 'READY') {
      await NotificationService.sendOrderReady({
        recipientPhone: order.customerPhone,
        customerName: order.customerName,
        storeName: order.store.name,
        orderNumber: order.queueNumber || 'N/A',
        orderUrl: `${process.env.NEXTAUTH_URL}/store/${order.storeId}/order/${order.id}`
      });
    }

    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    console.error("Update order error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
