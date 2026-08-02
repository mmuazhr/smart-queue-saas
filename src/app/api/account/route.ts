// =============================================================================
// Account API — profile updates for the signed-in user
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { updateAccountSchema } from "@/lib/validators";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, phone: true, avatarUrl: true, trialEndsAt: true, earlyBird: true, frozenAt: true },
  });
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ success: true, data: user });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateAccountSchema.safeParse(body);
  if (!parsed.success) {
    const errors = Object.fromEntries(
      parsed.error.issues.map((i) => [i.path.join("."), i.message])
    );
    return NextResponse.json(
      { success: false, error: "Validation failed", errors },
      { status: 400 }
    );
  }

  const { name, email, phone, avatarUrl } = parsed.data;

  if (email) {
    const taken = await prisma.user.findFirst({
      where: { email, NOT: { id: session.user.id } },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json(
        { success: false, code: "EMAIL_TAKEN", error: "That email is already in use." },
        { status: 409 }
      );
    }
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(phone !== undefined ? { phone } : {}), // null clears, string sets
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
    },
    select: { id: true, name: true, email: true, phone: true, avatarUrl: true },
  });

  return NextResponse.json({ success: true, data: user });
}
