// =============================================================================
// Admin Store Status API — suspend / reactivate a store
// =============================================================================
// The edge middleware only role-gates the /admin pages, not /api/admin, so
// every handler here re-checks the ADMIN role itself.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { adminStoreStatusSchema } from "@/lib/validators";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  if (session.user.role !== "ADMIN") return "forbidden" as const;
  return session;
}

// PATCH /api/admin/stores/[storeId]/status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const gate = await requireAdmin();
  if (gate === null) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (gate === "forbidden") return NextResponse.json({ success: false, code: "FORBIDDEN", error: "Admin only" }, { status: 403 });

  const { storeId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = adminStoreStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed" }, { status: 400 });
  }

  const existing = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
  }

  // suspendedAt starts the 7-day purge clock the merchants listing sweeps on;
  // reactivating clears it so a restored store is never collected.
  const store = await prisma.store.update({
    where: { id: storeId },
    data: {
      status: parsed.data.status,
      suspendedAt: parsed.data.status === "SUSPENDED" ? new Date() : null,
    },
    select: { id: true, status: true, suspendedAt: true },
  });

  await prisma.auditLog.create({
    data: {
      actorId: gate.user.id,
      action: parsed.data.status === "SUSPENDED" ? "ADMIN_STORE_SUSPEND" : "ADMIN_STORE_REACTIVATE",
      targetType: "store",
      targetId: storeId,
    },
  });

  return NextResponse.json({ success: true, data: store });
}
