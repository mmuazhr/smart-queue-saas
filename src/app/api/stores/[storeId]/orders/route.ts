// =============================================================================
// Store Active Orders API — For merchant dashboard
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/stores/[storeId]/orders?active=true
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const { storeId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || (store.ownerId !== session.user.id && session.user.role !== "ADMIN")) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const activeOnly = searchParams.get("active") === "true";

  const orders = await prisma.order.findMany({
    where: {
      storeId,
      ...(activeOnly
        ? { status: { in: ["PAID", "ACCEPTED", "PREPARING", "READY"] } }
        : {}),
    },
    include: {
      orderItems: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ success: true, data: orders });
}
