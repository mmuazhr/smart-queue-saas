// Server-only Supabase Storage access (service role key — never expose client-side).
import { createClient } from "@supabase/supabase-js";

export const PUBLIC_BUCKET = "public-assets";
export const PROOF_BUCKET = "payment-proofs";

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase storage not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function uploadPublicAsset(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const supabase = client();
  const { error } = await supabase.storage.from(PUBLIC_BUCKET).upload(key, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(key).data.publicUrl;
}

export async function uploadPaymentProof(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const { error } = await client().storage.from(PROOF_BUCKET).upload(key, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return key;
}

export async function getPaymentProofBytes(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const { data, error } = await client().storage.from(PROOF_BUCKET).download(key);
  if (error || !data) return null;
  return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type || "image/jpeg" };
}
