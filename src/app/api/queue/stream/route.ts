// =============================================================================
// SSE Endpoint — Real-Time Order & Queue Updates
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Safe fields projected for the public single-order stream
const ORDER_PUBLIC_FIELDS = {
  id: true,
  queueNumber: true,
  status: true,
  estimatedWaitMins: true,
  paidAt: true,
  acceptedAt: true,
  preparingAt: true,
  readyAt: true,
  completedAt: true,
  createdAt: true,
} as const;

export async function GET(request: NextRequest) {
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

      const poll = async () => {
        try {
          if (orderId) {
            // Single-order stream: project only safe fields — no phone/name
            const order = await prisma.order.findUnique({
              where: { id: orderId },
              select: ORDER_PUBLIC_FIELDS,
            });

            if (order) {
              sendEvent({ type: "ORDER_UPDATE", ...order });

              if (order.status === "COMPLETED" || order.status === "CANCELLED") {
                clearInterval(interval);
                controller.close();
              }
            }
          } else if (storeId) {
            const orders = await prisma.order.findMany({
              where: {
                storeId,
                status: { in: ["PAID", "ACCEPTED", "PREPARING", "READY"] },
              },
              orderBy: { createdAt: "asc" },
            });
            sendEvent({ type: "STORE_QUEUE_UPDATE", orders });
          }
        } catch (error) {
          logger.error("SSE Polling Error:", error);
        }
      };

      await poll();
      const interval = setInterval(poll, 3000);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
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
