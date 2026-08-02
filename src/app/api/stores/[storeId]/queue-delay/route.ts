// =============================================================================
// Store Queue Delay — merchant shifts every active order's promise at once
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { storeQueueDelaySchema } from "@/lib/validators";
import { invalidateEtaCache } from "@/lib/eta-service";
import { logger } from "@/lib/logger";

// PATCH /api/stores/[storeId]/queue-delay — set (or clear, with 0) the
// store-wide delay. Active orders' promises shift by the delta; new orders
// pick the delay up through the estimate itself.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const { storeId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = storeQueueDelaySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { delayMins, reason } = parsed.data;

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { ownerId: true, queueDelayMins: true },
    });
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }
    if (session.user.role !== "ADMIN" && store.ownerId !== session.user.id) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const deltaMins = delayMins - store.queueDelayMins;

    await prisma.$transaction(async (tx) => {
      await tx.store.update({
        where: { id: storeId },
        data: {
          queueDelayMins: delayMins,
          queueDelayReason: delayMins === 0 ? null : (reason ?? undefined),
        },
      });
      if (deltaMins !== 0) {
        // Relative shift needs raw SQL — Prisma has no column-relative update.
        await tx.$executeRaw(Prisma.sql`
          UPDATE orders
          SET estimated_ready_at = estimated_ready_at + make_interval(mins => ${deltaMins}),
              delay_reason = COALESCE(${reason ?? null}, delay_reason)
          WHERE store_id = ${storeId}
            AND status IN ('PAID', 'ACCEPTED', 'PREPARING')
            AND estimated_ready_at IS NOT NULL
        `);
      }
    });

    invalidateEtaCache(storeId);

    return NextResponse.json({
      success: true,
      data: { storeId, queueDelayMins: delayMins, queueDelayReason: delayMins === 0 ? null : (reason ?? null) },
    });
  } catch (error) {
    logger.error("Store queue delay error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
