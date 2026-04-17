// =============================================================================
// SSE Endpoint — Real-Time Order & Queue Updates
// =============================================================================

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");
  const storeId = searchParams.get("storeId");

  if (!orderId && !storeId) {
    return new Response("Missing orderId or storeId", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Periodic polling in the background of the stream
      // In a production environment with Postgres, we'd use LISTEN/NOTIFY or a Pub/Sub
      // For this SaaS MVP on SQLite, we poll every 3 seconds
      const poll = async () => {
        try {
          if (orderId) {
            const order = await prisma.order.findUnique({
              where: { id: orderId },
              include: { store: true }
            });
            if (order) {
              sendEvent({
                type: "ORDER_UPDATE",
                status: order.status,
                queueNumber: order.queueNumber,
                estimatedWaitMins: order.estimatedWaitMins,
              });
              
              // Close stream if order is terminal
              if (order.status === "COMPLETED" || order.status === "CANCELLED") {
                clearInterval(interval);
                controller.close();
              }
            }
          } else if (storeId) {
            const orders = await prisma.order.findMany({
              where: {
                storeId,
                status: {
                  in: ["PAID", "ACCEPTED", "PREPARING", "READY"]
                }
              },
              orderBy: { createdAt: "asc" }
            });
            sendEvent({
              type: "STORE_QUEUE_UPDATE",
              orders
            });
          }
        } catch (error) {
          console.error("SSE Polling Error:", error);
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
      "Connection": "keep-alive",
    },
  });
}
