// =============================================================================
// Admin Merchants API — merchant listing with store and lifetime volume
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

// GET /api/admin/merchants
export async function GET() {
  const gate = await requireAdmin();
  if (gate === null) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (gate === "forbidden") return NextResponse.json({ success: false, code: "FORBIDDEN", error: "Admin only" }, { status: 403 });

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
      stores: { select: { id: true, name: true, slug: true, status: true, createdAt: true } },
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
        createdAt: u.createdAt,
        store: store ? { ...store, orderCount, gmv } : null,
      };
    })
  );

  return NextResponse.json({ success: true, data });
}
