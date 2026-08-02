// =============================================================================
// Order ETA Bump — merchant adds time to a single order's promise
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { orderEtaBumpSchema } from "@/lib/validators";
import { toPlainOrder } from "@/lib/serializers";
import { logger } from "@/lib/logger";

const ACTIVE_STATUSES = ["PAID", "ACCEPTED", "PREPARING"];

// PATCH /api/orders/[orderId]/eta — push this order's promise out by addMins
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = orderEtaBumpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { addMins, reason } = parsed.data;

    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        estimatedReadyAt: true,
        store: { select: { ownerId: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }
    if (session.user.role !== "ADMIN" && existing.store.ownerId !== session.user.id) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    if (!ACTIVE_STATUSES.includes(existing.status)) {
      return NextResponse.json(
        { success: false, error: "Only active orders can be delayed" },
        { status: 422 }
      );
    }

    // Push from the current promise, or from now if none was ever stamped.
    const base = existing.estimatedReadyAt ?? new Date();
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        etaAdjustMins: { increment: addMins },
        estimatedReadyAt: new Date(base.getTime() + addMins * 60_000),
        ...(reason ? { delayReason: reason } : {}),
      },
    });

    return NextResponse.json({ success: true, data: toPlainOrder(updated) });
  } catch (error) {
    logger.error("Order ETA bump error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
