// =============================================================================
// Public Store Wait — "current wait ~X min" for the menu page. No auth;
// rate-limited; nothing sensitive in the response.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { QUEUE_ACTIVE_STATUSES, isQueueFull } from "@/lib/capacity";
import { getStoreEtaContext } from "@/lib/eta-service";
import { computeEtaMins } from "@/lib/eta";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const WAIT_RATE_LIMIT = 30; // per minute per IP

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!checkRateLimit(`wait:${getClientIp(request.headers)}`, WAIT_RATE_LIMIT)) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const store = await prisma.store.findUnique({
      where: { slug },
      select: { id: true, status: true, maxConcurrentOrders: true },
    });
    if (!store || (store.status !== "ACTIVE" && store.status !== "CLOSED")) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const ctx = await getStoreEtaContext(store.id);
    if (!ctx) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const ordersAhead = await prisma.order.count({
      where: { storeId: store.id, status: { in: ["PAID", "ACCEPTED", "PREPARING"] } },
    });

    const waitMins = computeEtaMins({
      ordersAhead,
      stats: ctx.stats,
      fallbackPrepMins: ctx.avgPrepTimeMins,
      maxConcurrentOrders: ctx.maxConcurrentOrders,
      queueDelayMins: ctx.queueDelayMins,
    });

    // Separate from ordersAhead: the cap counts unconfirmed orders too, while
    // the ETA only counts work the kitchen has already taken on. Only the
    // boolean is exposed — the raw count is the merchant's business.
    const queueCount = await prisma.order.count({
      where: { storeId: store.id, status: { in: [...QUEUE_ACTIVE_STATUSES] } },
    });
    const queueFull = isQueueFull(queueCount, store.maxConcurrentOrders);

    return NextResponse.json({ success: true, data: { waitMins, queueFull } });
  } catch (error) {
    logger.error("Store wait error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
