// =============================================================================
// Store API Routes — List & Create
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createStoreSchema } from "@/lib/validators";
import { slugify } from "@/lib/utils";

// GET /api/stores — List stores owned by authenticated merchant
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const stores = await prisma.store.findMany({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ success: true, data: stores });
}

// POST /api/stores — Create a new store
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = createStoreSchema.safeParse(body);

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

    // Generate unique slug
    let slug = slugify(parsed.data.name);
    let slugExists = await prisma.store.findUnique({ where: { slug } });
    let suffix = 2;
    while (slugExists) {
      slug = `${slugify(parsed.data.name)}-${suffix}`;
      slugExists = await prisma.store.findUnique({ where: { slug } });
      suffix++;
    }

    const store = await prisma.store.create({
      data: {
        ...parsed.data,
        slug,
        ownerId: session.user.id,
        status: "PENDING",
        operatingHours: (parsed.data.operatingHours as any) ?? undefined,
      },
    });

    return NextResponse.json({ success: true, data: store }, { status: 201 });
  } catch (error) {
    console.error("Create store error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
