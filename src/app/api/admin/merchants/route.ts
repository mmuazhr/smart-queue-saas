// =============================================================================
// Admin Merchants API — merchant listing with store and lifetime volume
// =============================================================================
// The edge middleware only role-gates the /admin pages, not /api/admin, so
// every handler here re-checks the ADMIN role itself.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { PURGE_AFTER_DAYS } from "@/lib/trial";
import { logger } from "@/lib/logger";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  if (session.user.role !== "ADMIN") return "forbidden" as const;
  return session;
}

/**
 * Permanently deletes merchants whose store has been suspended for longer than
 * the purge window. Runs on every admin listing load so no cron is needed; a
 * failure is logged and skipped rather than breaking the page. The role filter
 * keeps this — the only irreversible operation in the admin area — away from
 * any non-merchant account that happens to own a store.
 */
async function sweepPurgedMerchants(actorId: string) {
  const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  try {
    const expired = await prisma.store.findMany({
      where: { status: "SUSPENDED", suspendedAt: { lt: cutoff }, owner: { role: "MERCHANT" } },
      select: { id: true, ownerId: true },
    });

    for (const store of expired) {
      try {
        // Foreign keys are not all cascading, so children go first in
        // dependency order and the whole merchant lands in one transaction.
        await prisma.$transaction([
          prisma.notification.deleteMany({ where: { order: { storeId: store.id } } }),
          prisma.orderItem.deleteMany({ where: { order: { storeId: store.id } } }),
          prisma.order.deleteMany({ where: { storeId: store.id } }),
          prisma.menuItem.deleteMany({ where: { storeId: store.id } }),
          prisma.category.deleteMany({ where: { storeId: store.id } }),
          prisma.dailyQueueCounter.deleteMany({ where: { storeId: store.id } }),
          prisma.store.delete({ where: { id: store.id } }),
          prisma.user.delete({ where: { id: store.ownerId } }),
          prisma.auditLog.create({
            data: {
              actorId,
              action: "ADMIN_MERCHANT_PURGE",
              targetType: "user",
              targetId: store.ownerId,
            },
          }),
        ]);
      } catch (error) {
        logger.error("Merchant purge failed:", error);
      }
    }
  } catch (error) {
    logger.error("Merchant purge sweep failed:", error);
  }
}

// GET /api/admin/merchants
export async function GET() {
  const gate = await requireAdmin();
  if (gate === null) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (gate === "forbidden") return NextResponse.json({ success: false, code: "FORBIDDEN", error: "Admin only" }, { status: 403 });

  await sweepPurgedMerchants(gate.user.id);

  const users = await prisma.user.findMany({
    where: { role: "MERCHANT" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
      isVerified: true,
      trialEndsAt: true,
      earlyBird: true,
      frozenAt: true,
      stores: {
        select: { id: true, name: true, slug: true, status: true, suspendedAt: true, createdAt: true },
      },
    },
  });

  const data = await Promise.all(
    users.map(async (u) => {
      const store = u.stores[0] ?? null;
      let orderCount = 0;
      let gmv = 0;
      if (store) {
        const agg = await prisma.order.aggregate({
          _count: true,
          _sum: { total: true },
          where: { storeId: store.id, status: { not: "CANCELLED" } },
        });
        orderCount = agg._count;
        gmv = Number(agg._sum.total ?? 0);
      }
      return {
        userId: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        isVerified: u.isVerified,
        trialEndsAt: u.trialEndsAt,
        earlyBird: u.earlyBird,
        frozenAt: u.frozenAt,
        createdAt: u.createdAt,
        store: store ? { ...store, orderCount, gmv } : null,
      };
    })
  );

  return NextResponse.json({ success: true, data });
}
