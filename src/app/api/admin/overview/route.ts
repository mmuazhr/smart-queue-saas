// =============================================================================
// Admin Overview API — platform-wide metrics
// =============================================================================
// The edge middleware only role-gates the /admin pages, not /api/admin, so
// every handler here re-checks the ADMIN role itself.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  if (session.user.role !== "ADMIN") return "forbidden" as const;
  return session;
}

// GET /api/admin/overview
export async function GET() {
  const gate = await requireAdmin();
  if (gate === null) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (gate === "forbidden") return NextResponse.json({ success: false, code: "FORBIDDEN", error: "Admin only" }, { status: 403 });

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const notCancelled = { status: { not: "CANCELLED" } } as const;
  // GMV counts money actually moving: exclude unpaid abandoned checkouts too
  const paidThrough = {
    status: { in: ["PAID", "ACCEPTED", "PREPARING", "READY", "COMPLETED"] },
  };

  const [merchants, stores, activeStores, ordersToday, orders7d, gmvTodayAgg, gmv7dAgg] =
    await Promise.all([
      prisma.user.count({ where: { role: "MERCHANT" } }),
      prisma.store.count(),
      prisma.store.count({ where: { status: "ACTIVE" } }),
      prisma.order.count({ where: { ...notCancelled, createdAt: { gte: dayStart } } }),
      prisma.order.count({ where: { ...notCancelled, createdAt: { gte: week } } }),
      prisma.order.aggregate({ _sum: { total: true }, where: { ...paidThrough, createdAt: { gte: dayStart } } }),
      prisma.order.aggregate({ _sum: { total: true }, where: { ...paidThrough, createdAt: { gte: week } } }),
    ]);

  return NextResponse.json({
    success: true,
    data: {
      merchants,
      stores,
      activeStores,
      ordersToday,
      orders7d,
      gmvToday: Number(gmvTodayAgg._sum?.total ?? 0),
      gmv7d: Number(gmv7dAgg._sum?.total ?? 0),
    },
  });
}
