// =============================================================================
// Menu Item Detail API Routes — Update & Delete
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { updateMenuItemSchema } from "@/lib/validators";
import { toTitleCase } from "@/lib/format";

// PUT /api/stores/[storeId]/menu/[itemId]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string; itemId: string }> }
) {
  const { storeId, itemId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || (store.ownerId !== session.user.id && session.user.role !== "ADMIN")) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = updateMenuItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // A categoryId from another store must never be accepted — the route
    // only checks storeId ownership above, so a cross-store categoryId
    // would otherwise let this item render inside another store's menu.
    if (parsed.data.categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: parsed.data.categoryId, storeId },
        select: { id: true },
      });
      if (!category) {
        return NextResponse.json(
          { success: false, error: "categoryId does not belong to this store" },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.menuItem.update({
      where: { id: itemId, storeId }, // Ensure it belongs to the store
      data: {
        ...parsed.data,
        ...(parsed.data.name !== undefined && { name: toTitleCase(parsed.data.name) }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Update menu item error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/stores/[storeId]/menu/[itemId]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ storeId: string; itemId: string }> }
) {
  const { storeId, itemId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || (store.ownerId !== session.user.id && session.user.role !== "ADMIN")) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    await prisma.menuItem.delete({
      where: { id: itemId, storeId },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete menu item error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
