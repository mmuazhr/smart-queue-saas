// =============================================================================
// Prisma Client Singleton
// =============================================================================
// Prevents multiple Prisma Client instances during Next.js hot-reload in dev.
// Uses the node-postgres driver adapter so the same client works under Node
// and on Cloudflare Workers, where Prisma's native query engine cannot run.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Cloudflare Workers kill TCP sockets between requests, so a pooled pg
// connection reused across requests is a dead socket (alternating 200/500).
// On Workers: never keep idle connections — every query dials fresh.
const isWorkers =
  globalThis.navigator?.userAgent === "Cloudflare-Workers";

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL not configured");
  }

  const adapter = new PrismaPg(
    isWorkers
      ? { connectionString, max: 2, maxUses: 1, idleTimeoutMillis: 100, allowExitOnIdle: true }
      : { connectionString }
  );

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
