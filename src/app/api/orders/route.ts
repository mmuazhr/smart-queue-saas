// =============================================================================
// Order API Routes — Create Order & Payment Initiation
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createOrderSchema } from "@/lib/validators";
import { auth } from "@/lib/auth";
import { computeCharges, parseStoreCharges } from "@/lib/charges";
import { isStoreOpen } from "@/lib/store-hours";
import { toPlainOrder } from "@/lib/serializers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { Prisma } from "@prisma/client";

const RATE_LIMIT_POST = 10; // 10 POST /api/orders per minute per IP

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

    const store = await prisma.store.findUnique({
      where: { id: storeId, ownerId: session.user.id },
    });

    if (!store && session.user.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const where: Prisma.OrderWhereInput = { storeId };
    if (status) {
      where.status = { in: status.split(",") };
    }

    const orders = await prisma.order.findMany({
      where,
      include: { orderItems: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Same shape as the SSE STORE_QUEUE_UPDATE payload, so the board does not
    // flip state when it swaps this initial load for the stream.
    return NextResponse.json({
      success: true,
      data: orders.map((order) => ({ ...toPlainOrder(order), hasProof: !!order.paymentProofUrl })),
    });
  } catch (error) {
    logger.error("Fetch orders error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/orders — Create a new order and initiate payment
export async function POST(request: NextRequest) {
  // Rate limit: 10 requests / minute / IP
  const ip = getClientIp(request.headers);
  if (!checkRateLimit(`orders:${ip}`, RATE_LIMIT_POST)) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const parsed = createOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { storeId, customerPhone, customerName, notes, items } = parsed.data;

    // Verify store exists, is active, and fetch operating hours
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, status: true, name: true, slug: true, operatingHours: true, charges: true, ordersPaused: true },
    });

    if (!store || store.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: "Store is not available" },
        { status: 400 }
      );
    }

    // Emergency pause: merchant has toggled off new orders (kitchen issue,
    // etc). Existing orders keep flowing; only creation is gated here.
    if (store.ordersPaused) {
      return NextResponse.json(
        { success: false, error: "The shop has temporarily paused new orders. Please try again soon." },
        { status: 422 }
      );
    }

    // Enforce operating hours (Asia/Kuala_Lumpur)
    const hours = store.operatingHours as Record<string, { open: string; close: string; isClosed: boolean }> | null;
    if (!isStoreOpen(hours)) {
      return NextResponse.json(
        { success: false, error: "Store is currently closed" },
        { status: 400 }
      );
    }

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

    const unavailable = menuItems.filter((mi) => !mi.isAvailable);
    if (unavailable.length > 0) {
      return NextResponse.json(
        { success: false, error: `Items unavailable: ${unavailable.map((i) => i.name).join(", ")}` },
        { status: 400 }
      );
    }

    // Build order items and calculate totals server-side using Decimal arithmetic
    const menuItemMap = new Map(menuItems.map((mi) => [mi.id, mi]));

    let subtotalCents = 0; // work in integer cents to avoid floating-point drift
    const orderItemsData = items.map((item) => {
      const mi = menuItemMap.get(item.menuItemId)!;
      const priceCents = Math.round(Number(mi.price) * 100);
      const lineCents = priceCents * item.quantity;
      subtotalCents += lineCents;

      return {
        menuItemId: item.menuItemId,
        itemName: mi.name,
        itemPrice: new Prisma.Decimal((priceCents / 100).toFixed(2)),
        quantity: item.quantity,
        lineTotal: new Prisma.Decimal((lineCents / 100).toFixed(2)),
        specialInstructions: item.specialInstructions || null,
      };
    });

    const { lines: chargeLines, chargeTotalCents } = computeCharges(
      subtotalCents,
      parseStoreCharges(store.charges)
    );
    const totalCents = subtotalCents + chargeTotalCents;

    const subtotal = new Prisma.Decimal((subtotalCents / 100).toFixed(2));
    const tax = new Prisma.Decimal((chargeTotalCents / 100).toFixed(2));
    const total = new Prisma.Decimal((totalCents / 100).toFixed(2));

    // Queue number is assigned on merchant confirmation, never here.
    const order = await prisma.order.create({
      data: {
        storeId,
        customerPhone,
        customerName,
        notes,
        subtotal,
        tax,
        total,
        chargeBreakdown: chargeLines as unknown as Prisma.InputJsonValue,
        status: "AWAITING_CONFIRMATION",
        paymentMethod: parsed.data.paymentMethod,
        paymentStatus: "PENDING",
        orderItems: { create: orderItemsData },
      },
      select: { id: true, status: true },
    });

    return NextResponse.json(
      { success: true, data: { orderId: order.id, status: order.status } },
      { status: 201 }
    );
  } catch (error) {
    logger.error("Create order error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
