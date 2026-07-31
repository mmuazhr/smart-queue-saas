// =============================================================================
// File Upload API Route — Supabase Storage
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

const VALID_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ValidMime = (typeof VALID_MIME_TYPES)[number];

const MIME_TO_EXT: Record<ValidMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(request: NextRequest) {
  // Lazy-init: validate env vars inside the handler so the module can be
  // imported during build without crashing on missing env vars.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { success: false, error: "Storage not configured" },
      { status: 503 }
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });
    }

    // Validate file type against known MIME types (not user-supplied filename)
    if (!(VALID_MIME_TYPES as readonly string[]).includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid file type. Please upload an image (JPG, PNG, WEBP, or GIF).",
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "File too large. Maximum size is 5MB." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Derive extension from validated MIME type — never from user-supplied filename
    const extension = MIME_TO_EXT[file.type as ValidMime];
    const filename = `${uuidv4()}.${extension}`;
    const filePath = `menu-items/${filename}`;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error } = await supabase.storage
      .from("products")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      logger.error("Supabase storage error:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to upload to cloud storage. Ensure the 'products' bucket exists.",
        },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("products").getPublicUrl(filePath);

    return NextResponse.json({ success: true, url: publicUrl }, { status: 200 });
  } catch (error) {
    logger.error("Upload error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
