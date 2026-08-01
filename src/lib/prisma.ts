// =============================================================================
// Prisma Client Singleton
// =============================================================================
// Prevents multiple Prisma Client instances during Next.js hot-reload in dev.
// Uses the node-postgres driver adapter with a normal long-lived pool.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Supabase's session-mode pooler caps us at 15 clients for the whole project,
// and a Railway deploy briefly runs the old and the new container at once. Two
// containers must therefore fit under 15, so one container may hold at most 7
// connections. Without an explicit max, node-postgres defaults to 10 per pool,
// which breaches the ceiling during any deploy overlap (observed in production
// as `EMAXCONNSESSION ... pool_size: 15` 500s on store reads right after a
// deploy).
const POOL_MAX_CONNECTIONS = 7;
// Wait for a free connection instead of failing fast; a saturated pool should
// queue and only eventually error, never open more sockets.
const POOL_CONNECTION_TIMEOUT_MS = 10_000;
// Hand idle connections back to the pooler quickly, which shortens the window
// in which a draining old container still occupies slots the new one needs.
const POOL_IDLE_TIMEOUT_MS = 30_000;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL not configured");
  }

  const adapter = new PrismaPg({
    connectionString,
    max: POOL_MAX_CONNECTIONS,
    connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Cache on globalThis in every environment, production included. A production
// build emits this module into three separate Node-runtime bundles, each with
// its own module registry: the instrumentation hook, the Route Handler bundle,
// and the RSC/page bundle. Without caching, each one builds its own pool and
// the per-container budget above is multiplied by three. They share a single
// globalThis, so caching keeps it to one pool. Dev hot-reload behaviour is
// unchanged.
globalForPrisma.prisma = prisma;

export default prisma;
