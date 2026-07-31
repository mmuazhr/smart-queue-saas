// =============================================================================
// Order Lookup API Route — anonymous "find my order" (store + phone + today)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { phoneSchema } from "@/lib/validators";
import { logger } from "@/lib/logger";
import { z } from "zod";

const RATE_LIMIT_GET = 10; // 10 lookups / minute / IP

const lookupSchema = z.object({
  storeId: z.string().uuid(),
  phone: phoneSchema,
});

// GET /api/orders/lookup — today's non-cancelled orders for one store + phone
export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers);
  if (!checkRateLimit(`lookup:${ip}`, RATE_LIMIT_GET)) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = lookupSchema.safeParse({
    storeId: searchParams.get("storeId"),
    phone: searchParams.get("phone"),
  });
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid store or phone" }, { status: 400 });
  }

  try {
    // "Today" means today in Malaysia, not in whatever zone the server runs in —
    // a UTC server would otherwise hide orders placed before 08:00 MYT.
    const klDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
    const dayStart = new Date(`${klDate}T00:00:00+08:00`);

    const orders = await prisma.order.findMany({
      where: {
        storeId: parsed.data.storeId,
        customerPhone: parsed.data.phone,
        createdAt: { gte: dayStart },
        status: { not: "CANCELLED" },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, queueNumber: true, status: true, total: true, createdAt: true },
    });

    return NextResponse.json({
      success: true,
      data: orders.map((o) => ({ ...o, total: Number(o.total) })),
    });
  } catch (error) {
    logger.error("Order lookup error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
