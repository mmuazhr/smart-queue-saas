// =============================================================================
// Menu Item API Routes — List & Create
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createMenuItemSchema } from "@/lib/validators";
import { toTitleCase } from "@/lib/format";

// GET /api/stores/[storeId]/menu — List menu items grouped by category
// Intentionally unauthenticated: menu contents are public data (the
// storefront shows them to anonymous customers), so no ownership check is
// required here — this is not an oversight.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const { storeId } = await params;

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true },
  });

  if (!store) {
    return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
  }

  const categories = await prisma.category.findMany({
    where: { storeId, isActive: true },
    include: {
      // Defense in depth: scope by storeId even though category is already
      // storeId-scoped above, so a future regression in category ownership
      // can't surface another store's items here.
      menuItems: {
        where: { storeId },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  // Also get uncategorized items
  const uncategorized = await prisma.menuItem.findMany({
    where: { storeId, categoryId: null },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({
    success: true,
    data: { categories, uncategorized },
  });
}

// POST /api/stores/[storeId]/menu — Create a menu item
export async function POST(
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

  try {
    const body = await request.json();
    const parsed = createMenuItemSchema.safeParse(body);

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

    const item = await prisma.menuItem.create({
      data: {
        ...parsed.data,
        name: toTitleCase(parsed.data.name),
        storeId,
        categoryId: parsed.data.categoryId ?? null,
        imageUrl: parsed.data.imageUrl ?? null,
        prepTimeMins: parsed.data.prepTimeMins ?? null,
      },
    });

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error) {
    console.error("Create menu item error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
