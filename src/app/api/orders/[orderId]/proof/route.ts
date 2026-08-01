// =============================================================================
// Order Payment Proof API Route — Public Upload & Merchant View
// =============================================================================
// PATCH is public (anonymous customer, matches PUBLIC_PATHS "/api/orders" prefix
// in src/middleware.ts) so every guard here is load-bearing: rate limit, status,
// single-write, magic-byte sniff, size cap, server-generated storage key.
// GET is merchant/admin-only and does its own auth (middleware treats it as public).

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { sniffImageType, MAX_UPLOAD_BYTES } from "@/lib/image-sniff";
import { uploadPaymentProof, getPaymentProofBytes } from "@/lib/storage";
import { logger } from "@/lib/logger";

const PROOF_RATE_LIMIT = 5; // per IP per minute

// PATCH /api/orders/[orderId]/proof — customer attaches payment proof (public, constrained)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  try {
    if (!checkRateLimit(`proof:${getClientIp(request.headers)}`, PROOF_RATE_LIMIT)) {
      return NextResponse.json({ success: false, error: "RATE_LIMITED" }, { status: 429 });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, paymentProofUrl: true },
    });

    if (!order) {
      return NextResponse.json({ success: false, error: "NOT_FOUND" }, { status: 404 });
    }
    if (order.paymentProofUrl) {
      return NextResponse.json({ success: false, error: "PROOF_ALREADY_ATTACHED" }, { status: 409 });
    }
    if (order.status !== "AWAITING_CONFIRMATION") {
      return NextResponse.json({ success: false, error: "INVALID_STATUS" }, { status: 422 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ success: false, error: "INVALID_IMAGE" }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImageType(bytes);
    if (!type) {
      return NextResponse.json({ success: false, error: "INVALID_IMAGE" }, { status: 400 });
    }

    // Server-generated key — no caller input in the storage path.
    const key = `${orderId}/${randomUUID()}`;
    await uploadPaymentProof(key, bytes, type);

    // Guard against a concurrent double-submit: only write if still empty.
    // Upload happens before this conditional write — a lost race orphans a
    // storage object (acceptable); it never overwrites an existing proof.
    const updated = await prisma.order.updateMany({
      where: { id: orderId, paymentProofUrl: null },
      data: { paymentProofUrl: key },
    });

    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "PROOF_ALREADY_ATTACHED" }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Attach payment proof error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/orders/[orderId]/proof — store owner or admin views the proof (private bucket, streamed)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { paymentProofUrl: true, store: { select: { ownerId: true } } },
    });

    if (!order) {
      return NextResponse.json({ success: false, error: "NOT_FOUND" }, { status: 404 });
    }

    // Verify the session user owns this store (or is ADMIN)
    if (session.user.role !== "ADMIN" && order.store.ownerId !== session.user.id) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    if (!order.paymentProofUrl) {
      return new NextResponse(null, { status: 404 });
    }

    const proof = await getPaymentProofBytes(order.paymentProofUrl);
    if (!proof) {
      return new NextResponse(null, { status: 404 });
    }

    // The storage key itself never appears in the response — only bytes.
    // Buffer.from(...) sidesteps a TS lib quirk where Uint8Array<ArrayBufferLike>
    // isn't assignable to BodyInit.
    return new NextResponse(Buffer.from(proof.bytes), {
      headers: {
        "Content-Type": proof.contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    logger.error("Fetch payment proof error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
