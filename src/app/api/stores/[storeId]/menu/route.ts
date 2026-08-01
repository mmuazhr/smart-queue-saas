// =============================================================================
// Menu Item API Routes — List & Create
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createMenuItemSchema } from "@/lib/validators";
import { toTitleCase } from "@/lib/format";

// GET /api/stores/[storeId]/menu — List menu items grouped by category
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
      menuItems: {
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
