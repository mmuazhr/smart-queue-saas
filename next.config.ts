import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep pg/prisma out of the Next bundle to avoid bundling issues
  serverExternalPackages: [
    "@prisma/client",
    ".prisma/client",
    "@prisma/adapter-pg",
    "pg",
  ],
};

export default nextConfig;
