// =============================================================================
// Category API Routes — List & Create
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createCategorySchema } from "@/lib/validators";
import { toTitleCase } from "@/lib/format";

// GET /api/stores/[storeId]/categories — List categories for a store
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const { storeId } = await params;

  const categories = await prisma.category.findMany({
    where: { storeId },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ success: true, data: categories });
}

// POST /api/stores/[storeId]/categories — Create a new category
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
    const parsed = createCategorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const category = await prisma.category.create({
      data: {
        ...parsed.data,
        name: toTitleCase(parsed.data.name),
        storeId,
      },
    });

    return NextResponse.json({ success: true, data: category }, { status: 201 });
  } catch (error) {
    console.error("Create category error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
