// =============================================================================
// Order Detail API Route — Get & Update Single Order
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { updateOrderStatusSchema } from "@/lib/validators";
import { assignQueueNumber } from "@/lib/queue";
import { NotificationService } from "@/lib/notifications/service";
import { toPlainOrder } from "@/lib/serializers";
import { logger } from "@/lib/logger";

// Forward-only status transitions allowed
const VALID_TRANSITIONS: Record<string, string[]> = {
  AWAITING_CONFIRMATION: ["PAID", "CANCELLED"],
  PAID: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** Masks a phone number to last 4 digits: +60•••1234 */
function maskPhone(phone: string): string {
  if (phone.length <= 4) return "••••";
  return `${phone.slice(0, phone.startsWith("+") ? 3 : 1)}•••${phone.slice(-4)}`;
}

/** Returns first name only */
function maskName(name: string): string {
  return name.split(" ")[0];
}

// GET /api/orders/[orderId] — Public order tracking (PII masked for non-owners)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        store: {
          // paymentQrUrl / paymentInstructions drive the customer payment panel.
          // Both are merchant-published public values (paymentQrUrl comes from
          // the public-assets bucket), so they are safe on an unauthenticated GET.
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
            slug: true,
            paymentQrUrl: true,
            paymentInstructions: true,
          },
        },
        orderItems: true,
      },
    });

    if (!order) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    // Determine if caller is the store owner
    const session = await auth();
    const isOwner =
      session?.user?.id != null &&
      (session.user.role === "ADMIN" ||
        order.store.id ===
          (
            await prisma.store.findFirst({
              where: { id: order.storeId, ownerId: session.user.id },
              select: { id: true },
            })
          )?.id);

    // toPlainOrder strips paymentProofUrl (a private storage key), so the boolean
    // has to be derived from the raw row. paymentMethod passes through untouched.
    const plain = toPlainOrder(order);
    plain.hasProof = !!order.paymentProofUrl;

    if (!isOwner) {
      // Mask PII for unauthenticated / non-owner callers
      plain.customerPhone = maskPhone(order.customerPhone);
      plain.customerName = maskName(order.customerName);
    }

    return NextResponse.json({ success: true, data: plain });
  } catch (error) {
    logger.error("Fetch order error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Applies the AWAITING_CONFIRMATION → PAID transition: the merchant has seen the
 * transfer (or accepted a cash order) and the customer finally joins the queue.
 *
 * assignQueueNumber owns its own transaction around the daily counter, so it
 * cannot be nested inside one here. The number is therefore drawn first and the
 * status change applied second, guarded on the row still being
 * AWAITING_CONFIRMATION. Two merchants confirming at once means exactly one
 * update lands; the loser burns a queue number, which is harmless — the counter
 * only has to be monotonic, not gapless.
 *
 * Cash orders are NOT marked paid here: nothing has been handed over yet. They
 * settle on collection (see settlesCash in PATCH).
 */
async function confirmOrder(orderId: string, storeId: string, paymentMethod: string) {
  const queueNumber = await assignQueueNumber(storeId);
  const now = new Date();

  // Hoisted so the degraded response below can echo exactly what was committed.
  const confirmed = {
    status: "PAID",
    queueNumber,
    confirmedAt: now,
    ...(paymentMethod === "CASH" ? {} : { paymentStatus: "PAID", paidAt: now }),
  };

  const { count } = await prisma.order.updateMany({
    where: { id: orderId, status: "AWAITING_CONFIRMATION" },
    data: confirmed,
  });

  if (count === 0) {
    // Lost the race — another confirmation moved the order out of
    // AWAITING_CONFIRMATION between our read and this write.
    return NextResponse.json(
      { success: false, error: "Order is no longer awaiting confirmation" },
      { status: 422 }
    );
  }

  // Past this point the confirmation is COMMITTED. The re-read only exists to
  // build a richer response, so it must never turn a successful confirm into a
  // failure: letting it reach the caller's catch would report 500 for an order
  // that really is PAID, and the merchant's retry would then hit the 422 above
  // on an order they were never told was confirmed.
  try {
    const updated = await prisma.order.findUnique({
      where: { id: orderId },
      include: { store: true },
    });
    if (updated) {
      return NextResponse.json({ success: true, data: toPlainOrder(updated) });
    }
    logger.error("Confirm committed but order vanished on re-read:", orderId);
  } catch (readError) {
    logger.error("Confirm committed but re-read failed (non-fatal):", readError);
  }

  return NextResponse.json({ success: true, data: { id: orderId, ...confirmed } });
}

// PATCH /api/orders/[orderId] — Update order status (authenticated store owner)
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
    const body = await request.json();
    const parsed = updateOrderStatusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { status: newStatus, expectedStatus } = parsed.data;

    // Fetch order with store ownership info
    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      include: { store: { select: { id: true, ownerId: true, slug: true, name: true } } },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    // Verify the session user owns this store (or is ADMIN)
    if (
      session.user.role !== "ADMIN" &&
      existing.store.ownerId !== session.user.id
    ) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    // Merchant confirmation: this is the only point a queue number is handed out.
    // `await` is load-bearing — a bare `return` of the promise would let a
    // rejection escape this try/catch instead of being logged as a 500.
    // Routes on the freshly-read status; confirmOrder has its own independent
    // CAS (conditioned on AWAITING_CONFIRMATION at write time) so it's safe
    // even if this read is already stale by the time it runs.
    if (existing.status === "AWAITING_CONFIRMATION" && newStatus === "PAID") {
      return await confirmOrder(orderId, existing.storeId, existing.paymentMethod);
    }

    // Every other transition requires the client's last-known status and is
    // applied compare-and-swap style. A fresh server-side re-read is NOT a
    // substitute: the board can lag its own SSE stream by a few seconds, so
    // by the time a merchant clicks Reject on a card their UI still shows as
    // "Unconfirmed", another merchant may have already confirmed it — a fresh
    // read at this point would show PAID, and PAID→CANCELLED is a legitimate
    // transition in isolation, but not the one this merchant actually meant
    // to make. Only the client's own belief about the order's status, proven
    // against the row it's still true, may authorize the transition.
    if (!expectedStatus) {
      return NextResponse.json(
        { success: false, error: "expectedStatus is required" },
        { status: 400 }
      );
    }

    const allowed = VALID_TRANSITIONS[expectedStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid transition: ${expectedStatus} → ${newStatus}. Allowed: ${allowed.join(", ") || "none"}`,
        },
        { status: 422 }
      );
    }

    const timestampFields: Record<string, Date> = {};
    if (newStatus === "ACCEPTED") timestampFields.acceptedAt = new Date();
    if (newStatus === "PREPARING") timestampFields.preparingAt = new Date();
    if (newStatus === "READY") timestampFields.readyAt = new Date();
    if (newStatus === "COMPLETED") timestampFields.completedAt = new Date();

    // Collecting a completed cash order means it was paid at the counter —
    // otherwise the tracking page nags "please pay" forever. paymentMethod
    // itself never changes after order creation, so reading it off the
    // pre-CAS `existing` row (rather than expectedStatus) is safe.
    const settlesCash =
      newStatus === "COMPLETED" &&
      existing.paymentMethod === "CASH" &&
      existing.paymentStatus === "PENDING";

    const { count } = await prisma.order.updateMany({
      where: { id: orderId, status: expectedStatus },
      data: {
        status: newStatus,
        ...timestampFields,
        ...(settlesCash ? { paymentStatus: "PAID", paidAt: new Date() } : {}),
      },
    });

    if (count === 0) {
      // Lost the race — the order moved out of expectedStatus between the
      // client's last fetch and this request. Nothing was written.
      return NextResponse.json(
        { success: false, error: "This order was already updated elsewhere. Refresh and try again." },
        { status: 409 }
      );
    }

    const updated = await prisma.order.findUnique({
      where: { id: orderId },
      include: { store: true },
    });

    if (!updated) {
      logger.error("Update committed but order vanished on re-read:", orderId);
      return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }

    // Send notification outside transaction
    if (newStatus === "READY") {
      try {
        await NotificationService.sendOrderReady({
          recipientPhone: updated.customerPhone,
          customerName: updated.customerName,
          storeName: updated.store.name,
          orderNumber: updated.queueNumber ?? 0,
          orderUrl: `${process.env.NEXTAUTH_URL}/store/${updated.store.slug}/order/${updated.id}`,
        });
      } catch (notifErr) {
        logger.error("Notification failed (non-fatal):", notifErr);
      }
    }

    return NextResponse.json({ success: true, data: toPlainOrder(updated) });
  } catch (error) {
    logger.error("Update order error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
