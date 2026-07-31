// =============================================================================
// Admin Store Detail API — read-only support view of a single merchant store
// =============================================================================
// The edge middleware only role-gates the /admin pages, not /api/admin, so
// every handler here re-checks the ADMIN role itself.  Every read is recorded
// in audit_logs: looking into a merchant's store is a support action.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { toPlainOrder } from "@/lib/serializers";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  if (session.user.role !== "ADMIN") return "forbidden" as const;
  return session;
}

// GET /api/admin/stores/[storeId]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const gate = await requireAdmin();
  if (gate === null) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (gate === "forbidden") return NextResponse.json({ success: false, code: "FORBIDDEN", error: "Admin only" }, { status: 403 });

  const { storeId } = await params;
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  if (!store) {
    return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
  }

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const [activeOrders, categories, todayAgg] = await Promise.all([
    prisma.order.findMany({
      where: { storeId, status: { in: ["PAID", "ACCEPTED", "PREPARING", "READY"] } },
      orderBy: { createdAt: "asc" },
      include: { orderItems: true },
    }),
    prisma.category.findMany({
      where: { storeId },
      select: { name: true, _count: { select: { menuItems: true } } },
    }),
    prisma.order.aggregate({
      _count: true,
      _sum: { total: true },
      where: { storeId, status: { not: "CANCELLED" }, createdAt: { gte: dayStart } },
    }),
  ]);

  await prisma.auditLog.create({
    data: {
      actorId: gate.user.id,
      action: "ADMIN_STORE_VIEW",
      targetType: "store",
      targetId: storeId,
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        status: store.status,
        createdAt: store.createdAt,
        operatingHours: store.operatingHours,
      },
      owner: store.owner,
      activeOrders: activeOrders.map(toPlainOrder),
      menuSummary: categories.map((c) => ({ category: c.name, itemCount: c._count.menuItems })),
      todayStats: { orders: todayAgg._count, gmv: Number(todayAgg._sum.total ?? 0) },
    },
  });
}
