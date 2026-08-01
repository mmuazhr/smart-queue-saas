// =============================================================================
// Category Detail API Routes — Rename & Delete
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { updateCategorySchema } from "@/lib/validators";
import { toTitleCase } from "@/lib/format";

// PUT /api/stores/[storeId]/categories/[categoryId]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string; categoryId: string }> }
) {
  const { storeId, categoryId } = await params;
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
    const parsed = updateCategorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const updated = await prisma.category.update({
      where: { id: categoryId, storeId }, // Ensure it belongs to the store
      data: {
        ...parsed.data,
        ...(parsed.data.name !== undefined && { name: toTitleCase(parsed.data.name) }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Update category error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/stores/[storeId]/categories/[categoryId]
//
// Deleting a category does not delete its menu items — the `menu_items` FK
// (see prisma/schema.prisma, MenuItem.category) is ON DELETE SET NULL, so
// Postgres un-parents every item in this category to categoryId = null as
// part of the same DELETE statement. That's already atomic; no separate
// updateMany + delete transaction is needed.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ storeId: string; categoryId: string }> }
) {
  const { storeId, categoryId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || (store.ownerId !== session.user.id && session.user.role !== "ADMIN")) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    await prisma.category.delete({
      where: { id: categoryId, storeId },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete category error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
