// =============================================================================
// Admin Merchant Trial API — approve a merchant / toggle early-bird
// =============================================================================
// The edge middleware only role-gates the /admin pages, not /api/admin, so
// every handler here re-checks the ADMIN role itself.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { adminMerchantTrialSchema } from "@/lib/validators";

const TRIAL_DAYS = 7;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  if (session.user.role !== "ADMIN") return "forbidden" as const;
  return session;
}

// PATCH /api/admin/merchants/[userId]/trial
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const gate = await requireAdmin();
  if (gate === null) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (gate === "forbidden") return NextResponse.json({ success: false, code: "FORBIDDEN", error: "Admin only" }, { status: 403 });

  const { userId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = adminMerchantTrialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isVerified: true },
  });
  if (!user || user.role !== "MERCHANT") {
    return NextResponse.json({ success: false, error: "Merchant not found" }, { status: 404 });
  }

  const approving = parsed.data.approve === true && !user.isVerified;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(approving
        ? {
            isVerified: true,
            trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
          }
        : {}),
      ...(parsed.data.earlyBird !== undefined ? { earlyBird: parsed.data.earlyBird } : {}),
      ...(parsed.data.freeze !== undefined
        ? { frozenAt: parsed.data.freeze ? new Date() : null }
        : {}),
    },
    select: { id: true, isVerified: true, trialEndsAt: true, earlyBird: true, frozenAt: true },
  });

  if (approving) {
    await prisma.auditLog.create({
      data: {
        actorId: gate.user.id,
        action: "ADMIN_MERCHANT_APPROVE",
        targetType: "user",
        targetId: userId,
      },
    });
  }
  if (parsed.data.earlyBird !== undefined) {
    await prisma.auditLog.create({
      data: {
        actorId: gate.user.id,
        action: "ADMIN_MERCHANT_EARLYBIRD",
        targetType: "user",
        targetId: userId,
      },
    });
  }
  if (parsed.data.freeze !== undefined) {
    await prisma.auditLog.create({
      data: {
        actorId: gate.user.id,
        action: parsed.data.freeze ? "ADMIN_MERCHANT_FREEZE" : "ADMIN_MERCHANT_UNFREEZE",
        targetType: "user",
        targetId: userId,
      },
    });
  }

  return NextResponse.json({ success: true, data: updated });
}
