// scripts/setup-storage.mjs — run once per environment:
//   node --env-file=.env.production.local scripts/setup-storage.mjs
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in that env file.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
for (const [name, isPublic] of [["public-assets", true], ["payment-proofs", false]]) {
  const { error } = await supabase.storage.createBucket(name, {
    public: isPublic,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (error && !/already exists/i.test(error.message)) throw error;
  console.log(`${name}: ${error ? "exists" : "created"} (public=${isPublic})`);
}
