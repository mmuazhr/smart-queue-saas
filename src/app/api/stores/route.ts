// =============================================================================
// Store API Routes — List & Create
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createStoreSchema } from "@/lib/validators";
import { slugify } from "@/lib/utils";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";

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

    const baseSlug = slugify(parsed.data.name);

    const createData = {
      ...parsed.data,
      slug: baseSlug,
      ownerId: session.user.id,
      // Self-serve onboarding (decided 2026-07-31): stores are live immediately.
      // Nothing in the product can flip PENDING→ACTIVE, so PENDING was a dead end.
      status: "ACTIVE",
      operatingHours: (parsed.data.operatingHours as Prisma.InputJsonValue) ?? undefined,
    };

    try {
      // Rely on @unique constraint; catch P2002 and retry once with a suffix
      const store = await prisma.store.create({ data: createData });
      return NextResponse.json({ success: true, data: store }, { status: 201 });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const fallbackSlug = `${baseSlug}-${Date.now()}`;
        const store = await prisma.store.create({
          data: { ...createData, slug: fallbackSlug },
        });
        return NextResponse.json({ success: true, data: store }, { status: 201 });
      }
      throw err;
    }
  } catch (error) {
    logger.error("Create store error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
