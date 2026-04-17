// =============================================================================
// File Upload API Route — Supabase Storage
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: NextRequest) {
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

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ 
        success: false, 
        error: "Invalid file type. Please upload an image (JPG, PNG, WEBP, or GIF)." 
      }, { status: 400 });
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ 
        success: false, 
        error: "File too large. Maximum size is 5MB." 
      }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename
    const extension = file.name.split(".").pop();
    const filename = `${uuidv4()}.${extension}`;
    const filePath = `menu-items/${filename}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from("products")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false
      });

    if (error) {
      console.error("Supabase storage error:", error);
      return NextResponse.json({ 
        success: false, 
        error: "Failed to upload to cloud storage. Ensure the 'products' bucket exists." 
      }, { status: 500 });
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from("products")
      .getPublicUrl(filePath);

    return NextResponse.json({ 
      success: true, 
      url: publicUrl 
    }, { status: 200 });

  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Internal server error" 
    }, { status: 500 });
  }
}
