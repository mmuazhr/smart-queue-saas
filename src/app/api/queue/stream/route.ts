// =============================================================================
// SSE Endpoint — Real-Time Order & Queue Updates
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { toPlainOrder } from "@/lib/serializers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getStoreEtaContext } from "@/lib/eta-service";
import { isDelayed, projectReadyAt, remainingMins, shouldRevise } from "@/lib/eta";

export const dynamic = "force-dynamic";

// Customers legitimately reconnect on every navigation, so this is set to
// absorb normal churn and only bite on a connection flood.
const SSE_RATE_LIMIT = 15; // 15 stream connections per minute per IP

// An abandoned tab otherwise polls Postgres every 3s forever. A live client is
// unaffected: useOrderStream treats the close as an error and reconnects 5s
// later, which costs one extra connection per 15 min against SSE_RATE_LIMIT.
const MAX_STREAM_LIFETIME_MS = 15 * 60 * 1000;

// Safe fields projected for the public single-order stream
const ORDER_PUBLIC_FIELDS = {
  id: true,
  storeId: true,
  queueNumber: true,
  status: true,
  paymentStatus: true,
  estimatedWaitMins: true,
  estimatedReadyAt: true,
  etaAdjustMins: true,
  delayReason: true,
  confirmedAt: true,
  paidAt: true,
  acceptedAt: true,
  preparingAt: true,
  readyAt: true,
  completedAt: true,
  createdAt: true,
} as const;

export async function GET(request: NextRequest) {
  // Gate connection establishment before any DB work or stream setup
  if (!checkRateLimit(`sse:${getClientIp(request.headers)}`, SSE_RATE_LIMIT)) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");
  const storeId = searchParams.get("storeId");

  if (!orderId && !storeId) {
    return new NextResponse("Missing orderId or storeId", { status: 400 });
  }

  // Store-scoped stream requires merchant auth
  if (storeId) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { ownerId: true },
    });

    const isOwner = store?.ownerId === session.user.id || session.user.role === "ADMIN";
    if (!isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Declared before the first poll: the terminal-status branch below can fire
      // on that very first run, and referencing `interval` there before the
      // assignment threw a ReferenceError that the catch swallowed — leaving the
      // stream open until the next tick. `closed` additionally stops a poll that
      // is already in flight from enqueueing onto a closed controller.
      let interval: ReturnType<typeof setInterval> | undefined;
      let lifetimeTimer: ReturnType<typeof setTimeout> | undefined;
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        if (lifetimeTimer) clearTimeout(lifetimeTimer);
        controller.close();
      };

      const poll = async () => {
        if (closed) return;
        try {
          if (orderId) {
            // Single-order stream: project only safe fields — no phone/name
            let order = await prisma.order.findUnique({
              where: { id: orderId },
              select: ORDER_PUBLIC_FIELDS,
            });

            if (order) {
              const active = ["PAID", "ACCEPTED", "PREPARING"].includes(order.status);

              // Lazy delay revision: when the measured pace has drifted past
              // the promise, push the promise out (CAS on the old value so
              // concurrent streams write it exactly once) and re-read.
              if (active && order.estimatedReadyAt) {
                try {
                  const ctx = await getStoreEtaContext(order.storeId);
                  if (ctx) {
                    const now = new Date();
                    const ordersAhead =
                      order.queueNumber == null
                        ? 0
                        : await prisma.order.count({
                            where: {
                              storeId: order.storeId,
                              queueNumber: { lt: order.queueNumber },
                              status: { in: ["PAID", "ACCEPTED", "PREPARING"] },
                            },
                          });
                    const projected = projectReadyAt(
                      order,
                      ordersAhead,
                      ctx.stats,
                      ctx.avgPrepTimeMins,
                      ctx.maxConcurrentOrders,
                      now
                    );
                    if (shouldRevise(order.estimatedReadyAt, projected, order.estimatedWaitMins)) {
                      await prisma.order.updateMany({
                        where: { id: orderId, estimatedReadyAt: order.estimatedReadyAt },
                        data: { estimatedReadyAt: projected },
                      });
                      order = await prisma.order.findUnique({
                        where: { id: orderId },
                        select: ORDER_PUBLIC_FIELDS,
                      });
                    }
                  }
                } catch (etaError) {
                  logger.error("ETA revision failed (non-fatal):", etaError);
                }
              }

              if (order) {
                const now = new Date();
                sendEvent({
                  type: "ORDER_UPDATE",
                  ...order,
                  etaMinutes:
                    active && order.estimatedReadyAt
                      ? remainingMins(order.estimatedReadyAt, now)
                      : null,
                  delayed: isDelayed(order.confirmedAt, order.estimatedWaitMins, order.estimatedReadyAt),
                });

                if (order.status === "COMPLETED" || order.status === "CANCELLED") {
                  close();
                }
              }
            }
          } else if (storeId) {
            const orders = await prisma.order.findMany({
              where: {
                storeId,
                status: {
                  in: ["AWAITING_CONFIRMATION", "PAID", "ACCEPTED", "PREPARING", "READY"],
                },
              },
              orderBy: { createdAt: "asc" },
              // Must match the /api/orders shape — the dashboard renders
              // order.orderItems and Decimal fields from this payload
              include: { orderItems: true },
            });
            sendEvent({
              type: "STORE_QUEUE_UPDATE",
              // hasProof must be read off the raw row: toPlainOrder strips the
              // storage key itself, and the merchant only needs the boolean.
              orders: orders.map((order) => ({
                ...toPlainOrder(order),
                hasProof: !!order.paymentProofUrl,
              })),
            });
          }
        } catch (error) {
          logger.error("SSE Polling Error:", error);
        }
      };

      await poll();
      if (!closed) {
        interval = setInterval(poll, 3000);
        lifetimeTimer = setTimeout(close, MAX_STREAM_LIFETIME_MS);
      }

      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
