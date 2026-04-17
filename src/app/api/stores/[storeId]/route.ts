// =============================================================================
// Store Detail API Routes — Get & Update
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { updateStoreSchema } from "@/lib/validators";

// GET /api/stores/[storeId]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const { storeId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: {
      categories: { orderBy: { sortOrder: "asc" } },
      _count: { select: { orders: true, menuItems: true } },
    },
  });

  if (!store) {
    return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
  }

  if (store.ownerId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ success: true, data: store });
}

// PUT /api/stores/[storeId]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const { storeId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) {
    return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
  }

  if (store.ownerId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = updateStoreSchema.safeParse(body);

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path[0] as string] = issue.message;
      }
      return NextResponse.json(
        { success: false, error: "Validation failed", errors: fieldErrors },
        { status: 400 }
      );
    }

    const updated = await prisma.store.update({
      where: { id: storeId },
      data: {
        ...parsed.data,
        operatingHours: (parsed.data.operatingHours as any) ?? undefined,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Update store error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
