import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Keep pg/prisma out of the Next bundle so the Cloudflare adapter can pick
  // their workerd-conditional entrypoints (fixes "Could not resolve pg-cloudflare")
  serverExternalPackages: [
    "@prisma/client",
    ".prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "pg-cloudflare",
  ],
};

export default nextConfig;

// Makes Cloudflare bindings available in `next dev`.
initOpenNextCloudflareForDev();
