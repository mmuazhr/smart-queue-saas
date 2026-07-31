// =============================================================================
// Prisma Client Singleton
// =============================================================================
// Prevents multiple Prisma Client instances during Next.js hot-reload in dev.
// Uses the node-postgres driver adapter so the same client works under Node
// and on Cloudflare Workers, where Prisma's native query engine cannot run.
//
// Workers specifics:
// - TCP sockets cannot be reused across requests, so connections are
//   single-use (maxUses: 1, no idle pool) — a kept-alive socket from a
//   previous request is dead and fails every other query.
// - Fresh dials are made cheap by connecting through the HYPERDRIVE binding
//   (edge-local pool) instead of dialing Supabase in Singapore per query.
// - The client is created lazily so the Cloudflare context (bindings) is
//   available when the connection string is resolved.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const isWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

function resolveConnectionString(): string {
  if (isWorkers) {
    try {
      const hyperdrive = (getCloudflareContext().env as { HYPERDRIVE?: { connectionString: string } })
        .HYPERDRIVE;
      if (hyperdrive?.connectionString) return hyperdrive.connectionString;
    } catch {
      // fall through to DATABASE_URL (e.g. preview without the binding)
    }
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL not configured");
  }
  return connectionString;
}

function createPrismaClient(): PrismaClient {
  const connectionString = resolveConnectionString();

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

// One client per Worker request: sockets must not cross request contexts
// (Workers reject that), but per-QUERY clients accumulate memory/CPU until
// the isolate hits resource limits (observed as Cloudflare 1102) — the SSE
// stream's 3s polls multiply that fast. WeakMap on the request ctx gives
// exactly one client per request, GC'd with the request.
const workersClientCache = new WeakMap<object, PrismaClient>();

function getPrismaClient(): PrismaClient {
  if (isWorkers) {
    try {
      const { ctx } = getCloudflareContext();
      const cached = workersClientCache.get(ctx);
      if (cached) return cached;
      const client = createPrismaClient();
      workersClientCache.set(ctx, client);
      return client;
    } catch {
      // No request context (module init edge cases) — uncached fresh client
      return createPrismaClient();
    }
  }
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

// Lazy proxy: defer client construction until first use so Workers bindings
// (Hyperdrive) exist by the time the connection string is resolved. Each
// property access resolves against one concrete client, so multi-step APIs
// like $transaction stay on a single client.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient() as unknown as Record<PropertyKey, unknown>;
    const value = client[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});

export default prisma;
