// =============================================================================
// File Upload API Route — Merchant image upload (Supabase Storage)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { sniffImageType, MAX_UPLOAD_BYTES } from "@/lib/image-sniff";
import { uploadPublicAsset } from "@/lib/storage";
import { logger } from "@/lib/logger";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const KINDS = new Set(["qr", "menu", "logo", "avatar"]);

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "menu");

    if (!(file instanceof File) || !KINDS.has(kind)) {
      return NextResponse.json({ success: false, error: "INVALID_IMAGE" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ success: false, error: "FILE_TOO_LARGE" }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImageType(bytes);
    if (!type) {
      return NextResponse.json({ success: false, error: "INVALID_IMAGE" }, { status: 400 });
    }

    // Server-generated key only — caller filename never touches the storage path.
    const key = `${kind}/${session.user.id}/${randomUUID()}.${EXT[type]}`;
    const url = await uploadPublicAsset(key, bytes, type);

    return NextResponse.json({ success: true, data: { url } }, { status: 201 });
  } catch (error) {
    logger.error("Upload error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
