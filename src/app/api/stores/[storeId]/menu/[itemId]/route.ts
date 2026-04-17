// =============================================================================
// Menu Item Detail API Routes — Update & Delete
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { updateMenuItemSchema } from "@/lib/validators";

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

    const updated = await prisma.menuItem.update({
      where: { id: itemId, storeId }, // Ensure it belongs to the store
      data: parsed.data,
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
