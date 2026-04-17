// =============================================================================
// Order API Routes — Create Order & Payment Initiation
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createOrderSchema } from "@/lib/validators";
import { Decimal } from "@prisma/client/runtime/library";
import { auth } from "@/lib/auth";
import { PaymentService } from "@/lib/payments/service";
import { NotificationService } from "@/lib/notifications/service";

// GET /api/orders — List orders for a store (authenticated merchant)
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");
    const status = searchParams.get("status");

    if (!storeId) {
      return NextResponse.json({ success: false, error: "storeId is required" }, { status: 400 });
    }

    // Verify ownership
    const store = await prisma.store.findUnique({
      where: { id: storeId, ownerId: session.user.id },
    });

    if (!store && session.user.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const where: any = { storeId };
    if (status) {
      const statusList = status.split(",");
      where.status = { in: statusList };
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        orderItems: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: orders });
  } catch (error) {
    console.error("Fetch orders error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/orders — Create a new order and initiate payment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { storeId, customerPhone, customerName, notes, items, paymentGateway } = parsed.data;

    // Default to BILLPLZ if not specified (or whichever is preferred)
    const gateway = (paymentGateway || "STRIPE").toUpperCase() as "STRIPE" | "BILLPLZ";

    // Verify store exists and is active
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, status: true, name: true },
    });

    if (!store || store.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: "Store is not available" },
        { status: 400 }
      );
    }

    // Fetch all menu items to verify prices and availability
    const menuItemIds = items.map((item) => item.menuItemId);
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, storeId },
    });

    if (menuItems.length !== menuItemIds.length) {
      return NextResponse.json(
        { success: false, error: "One or more items not found" },
        { status: 400 }
      );
    }

    // Check availability
    const unavailable = menuItems.filter((mi) => !mi.isAvailable);
    if (unavailable.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Items unavailable: ${unavailable.map((i) => i.name).join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Build order items and calculate totals server-side
    const menuItemMap = new Map(menuItems.map((mi) => [mi.id, mi]));
    let subtotal = 0;
    const orderItemsData = items.map((item) => {
      const menuItem = menuItemMap.get(item.menuItemId)!;
      const lineTotal = menuItem.price * item.quantity;
      subtotal += lineTotal;

      return {
        menuItemId: item.menuItemId,
        itemName: menuItem.name,
        itemPrice: menuItem.price,
        quantity: item.quantity,
        lineTotal,
        specialInstructions: item.specialInstructions || null,
      };
    });

    const tax = subtotal * 0.06; // 6% SST
    const total = subtotal + tax;

    // Create order + items in a transaction
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          storeId,
          customerPhone,
          customerName,
          notes: notes || null,
          subtotal,
          tax,
          total,
          status: "PENDING_PAYMENT",
          paymentStatus: "PENDING",
          orderItems: {
            create: orderItemsData,
          },
        },
        include: {
          orderItems: true,
        },
      });

      return newOrder;
    });

    // Initiate Payment
    const payment = await PaymentService.initiatePayment(gateway, {
      orderId: order.id,
      amount: total,
      currency: "MYR",
      customerName,
      customerPhone,
      successUrl: `${process.env.NEXTAUTH_URL}/store/${storeId}/order/${order.id}?status=paid`,
      cancelUrl: `${process.env.NEXTAUTH_URL}/store/${storeId}/checkout?error=cancelled`,
    });

    return NextResponse.json({ 
      success: true, 
      data: {
        order,
        checkoutUrl: payment.redirectUrl 
      } 
    }, { status: 201 });
  } catch (error) {
    console.error("Create order error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
