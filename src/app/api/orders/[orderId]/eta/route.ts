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
    const newEstimatedReadyAt = new Date(base.getTime() + addMins * 60_000);
    const changes = {
      etaAdjustMins: { increment: addMins },
      estimatedReadyAt: newEstimatedReadyAt,
      ...(reason ? { delayReason: reason } : {}),
    };

    // CAS on status: the active-status check above ran outside a transaction,
    // so a status transition landing between that read and this write must
    // not let a bump apply to an order that's no longer active.
    const { count } = await prisma.order.updateMany({
      where: { id: orderId, status: { in: ACTIVE_STATUSES } },
      data: changes,
    });

    if (count === 0) {
      return NextResponse.json(
        { success: false, error: "This order was already updated elsewhere. Refresh and try again." },
        { status: 409 }
      );
    }

    // Past this point the bump is COMMITTED. The re-read only builds a
    // richer response, so a re-read failure must never turn a successful
    // update into a 500 — degrade to what we know was written instead.
    try {
      const updated = await prisma.order.findUnique({ where: { id: orderId } });
      if (updated) {
        return NextResponse.json({ success: true, data: toPlainOrder(updated) });
      }
      logger.error("ETA bump committed but order vanished on re-read:", orderId);
    } catch (readError) {
      logger.error("ETA bump committed but re-read failed (non-fatal):", readError);
    }

    return NextResponse.json({
      success: true,
      data: { id: orderId, estimatedReadyAt: newEstimatedReadyAt.toISOString(), ...(reason ? { delayReason: reason } : {}) },
    });
  } catch (error) {
    logger.error("Order ETA bump error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
