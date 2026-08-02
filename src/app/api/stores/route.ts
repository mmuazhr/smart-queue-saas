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

    // One store per merchant — the whole dashboard assumes stores[0].
    // A double-submit must not create a duplicate.
    const existingStore = await prisma.store.findFirst({
      where: { ownerId: session.user.id },
    });
    if (existingStore) {
      return NextResponse.json(
        {
          success: false,
          code: "STORE_EXISTS",
          error: "You already have a store.",
          data: existingStore,
        },
        { status: 409 }
      );
    }

    const baseSlug = slugify(parsed.data.name);

    const creator = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isVerified: true },
    });

    const createData = {
      ...parsed.data,
      slug: baseSlug,
      ownerId: session.user.id,
      // Stores go live only for approved merchants — an unapproved merchant's
      // store stays PENDING until admin approval flips it (or the store is
      // reactivated) via /api/admin/stores/[storeId]/status.
      status: creator?.isVerified ? "ACTIVE" : "PENDING",
      operatingHours: (parsed.data.operatingHours as Prisma.InputJsonValue) ?? undefined,
    };

    const isUniqueViolation = (err: unknown, column: string) =>
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      String(err.meta?.target ?? "").includes(column);

    // Concurrent double-submits race past the findFirst guard above; the
    // owner_id unique constraint is the authoritative backstop.
    const respondStoreExists = async () => {
      const existing = await prisma.store.findFirst({
        where: { ownerId: session.user.id },
      });
      return NextResponse.json(
        { success: false, code: "STORE_EXISTS", error: "You already have a store.", data: existing },
        { status: 409 }
      );
    };

    try {
      const store = await prisma.store.create({ data: createData });
      return NextResponse.json({ success: true, data: store }, { status: 201 });
    } catch (err) {
      if (isUniqueViolation(err, "owner_id")) return respondStoreExists();
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        // Slug collision — retry once with a suffix
        const fallbackSlug = `${baseSlug}-${Date.now()}`;
        try {
          const store = await prisma.store.create({
            data: { ...createData, slug: fallbackSlug },
          });
          return NextResponse.json({ success: true, data: store }, { status: 201 });
        } catch (err2) {
          if (isUniqueViolation(err2, "owner_id")) return respondStoreExists();
          throw err2;
        }
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
