# Live ETA + Closed Trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live customer wait-time estimates driven by measured merchant throughput (with delay detection, friendly delay messages, and merchant time bumps), plus closed-trial operations: manual admin approval of merchants, a sidebar trial-ring profile block, and trial-mode landing pricing.

**Architecture:** A pure calculation module (`src/lib/eta.ts`, fully unit-tested) feeds a thin DB service (`src/lib/eta-service.ts`, 30s in-memory cache). The estimate is stamped onto the order at merchant confirmation (`estimatedWaitMins` = original promise, `estimatedReadyAt` = current promise); the existing 3-second SSE poll streams remaining minutes and lazily revises the promise (compare-and-swap) when the measured pace falls behind. Trial features ride existing infrastructure: the admin merchants page, the Supabase upload route, and the `User.isVerified` field.

**Tech Stack:** Next.js 16 App Router (async `params`), Prisma 6 + PostgreSQL, next-auth v5, Vitest, Tailwind v4, SSE (existing `/api/queue/stream`).

**Spec:** `docs/superpowers/specs/2026-08-02-live-eta-and-closed-trial-design.md`

## Global Constraints

- Read `node_modules/next/dist/docs/` guidance if any Next.js API behaves unexpectedly — this Next 16 build has breaking changes (AGENTS.md). Dynamic route handlers receive `{ params }: { params: Promise<{...}> }` and must `await params`.
- API responses always use the repo shape: `{ success: boolean, data?, error?, errors?, code? }`.
- Status writes on orders use the compare-and-swap pattern: `prisma.order.updateMany({ where: { id, <precondition> }, data })` and check `count`.
- No `console.log` in server code — use `logger` from `@/lib/logger`. (Client pages use `console.error` in catch blocks — that existing idiom is fine.)
- Tests are colocated Vitest files (`src/lib/foo.test.ts`). Run with `npm test` (or `npx vitest run <file>` for one file). Typecheck: `npm run typecheck`.
- Commits: `<type>: <description>` (feat, fix, refactor, docs, test, chore). No attribution footers.
- Friendly customer-facing copy — warm, apologetic, never technical. Exact strings are given in the tasks; use them verbatim.
- All new fields must be backward-safe: existing orders/users have NULL/default values and every code path must tolerate that.
- Working directory: `/Users/muazhusaini/Documents/Project/QueLess/smart-queue-saas`.

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` + new migration | New columns on Order, Store, User + backfill `is_verified` for existing merchants |
| `src/lib/eta.ts` (create) | Pure ETA math: stats, estimate, projection, delay rule. No I/O. |
| `src/lib/eta.test.ts` (create) | Unit tests for all eta.ts functions |
| `src/lib/eta-service.ts` (create) | DB-backed stats with 30s cache; estimate for new order |
| `src/lib/trial.ts` + `src/lib/trial.test.ts` (create) | Pure trial-days math for the ring/badge |
| `src/lib/validators.ts` (modify) | New zod schemas: eta bump, queue delay, admin trial, avatarUrl |
| `src/app/api/orders/[orderId]/route.ts` (modify) | Stamp ETA in `confirmOrder` |
| `src/app/api/queue/stream/route.ts` (modify) | Stream ETA fields; lazy delay revision |
| `src/app/api/orders/[orderId]/eta/route.ts` (create) | Per-order “+X min” bump |
| `src/app/api/stores/[storeId]/queue-delay/route.ts` (create) | Store-wide delay set/clear |
| `src/app/api/stores/[slug]/wait/route.ts` (create) | Public “current wait” for the menu page |
| `src/hooks/useOrderStream.ts` (modify) | New fields on `OrderStreamUpdate` |
| `src/app/store/[slug]/order/[orderId]/page.tsx` (modify) | Live countdown + friendly delay banner |
| `src/app/store/[slug]/StoreMenuClient.tsx` (modify) | “~X min wait” chip |
| `src/app/dashboard/page.tsx` (modify) | ETA on cards, overdue highlight, bump buttons, delay-all control |
| `src/app/api/admin/merchants/route.ts` (modify) | Expose isVerified/trialEndsAt/earlyBird |
| `src/app/api/admin/merchants/[userId]/trial/route.ts` (create) | Approve + early-bird toggle (audited) |
| `src/app/admin/merchants/page.tsx` (modify) | Approve button, early-bird toggle, pending badge |
| `src/app/dashboard/layout.tsx` (modify) | Pending-approval gate for unverified merchants |
| `src/app/dashboard/PendingApproval.tsx` (create) | Friendly “we’re reviewing” screen |
| `src/app/api/account/route.ts` (modify) | Expose/accept avatarUrl, expose trialEndsAt/earlyBird |
| `src/app/api/upload/route.ts` (modify) | Allow `kind: "avatar"` |
| `src/app/dashboard/account/page.tsx` (modify) | Avatar upload UI |
| `src/components/dashboard/TrialProfile.tsx` (create) | Avatar + SVG trial ring + tier badge |
| `src/app/dashboard/DashboardShell.tsx` (modify) | Render TrialProfile in sidebar footer |
| `src/app/page.tsx` (modify) | Trial-mode pricing card behind `NEXT_PUBLIC_TRIAL_MODE` |
| `prisma/seed.ts` (modify) | Seed merchant gets `isVerified: true` + trialEndsAt |

---

### Task 1: Schema migration + seed update

**Files:**
- Modify: `prisma/schema.prisma` (Order ~line 110–145, Store ~line 40–50, User ~line 15–29)
- Create: `prisma/migrations/<timestamp>_eta_and_trial/migration.sql` (generated, then edited)
- Modify: `prisma/seed.ts` (~line 24–40)

**Interfaces:**
- Produces: `Order.estimatedReadyAt DateTime?`, `Order.etaAdjustMins Int @default(0)`, `Order.delayReason String?`, `Store.queueDelayMins Int @default(0)`, `Store.queueDelayReason String?`, `User.trialEndsAt DateTime?`, `User.earlyBird Boolean @default(false)`, `User.avatarUrl String?` — every later task depends on these names exactly.

- [ ] **Step 1: Add fields to schema.prisma**

In `model Order`, after the `estimatedWaitMins` line, add:

```prisma
  estimatedReadyAt DateTime? @map("estimated_ready_at")
  etaAdjustMins    Int       @default(0) @map("eta_adjust_mins")
  delayReason      String?   @map("delay_reason")
```

In `model Store`, after the `maxConcurrentOrders` line, add:

```prisma
  queueDelayMins   Int     @default(0) @map("queue_delay_mins")
  queueDelayReason String? @map("queue_delay_reason")
```

In `model User`, after the `isVerified` line, add:

```prisma
  trialEndsAt DateTime? @map("trial_ends_at")
  earlyBird   Boolean   @default(false) @map("early_bird")
  avatarUrl   String?   @map("avatar_url")
```

- [ ] **Step 2: Create the migration without applying, then append the backfill**

Run: `npx prisma migrate dev --name eta_and_trial --create-only`

Open the generated `prisma/migrations/*_eta_and_trial/migration.sql` and append at the end:

```sql
-- Existing merchants predate manual approval; grandfather them in so the
-- pending-approval gate does not lock out accounts that are already live.
UPDATE "users" SET "is_verified" = true WHERE "role" = 'MERCHANT';
```

(Check the table/column casing against the earlier statements in the same file — the schema maps to `users.is_verified`; match whatever quoting style the generated SQL uses.)

- [ ] **Step 3: Apply migration**

Run: `npx prisma migrate dev`
Expected: migration applies cleanly, `prisma generate` runs.

- [ ] **Step 4: Update seed merchant**

In `prisma/seed.ts`, find the merchant user creation (below the admin block at lines 24–32) and add to its `data`:

```typescript
    isVerified: true,
    trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
```

- [ ] **Step 5: Verify typecheck and existing tests still pass**

Run: `npm run typecheck && npm test`
Expected: PASS (no code references the new fields yet).

- [ ] **Step 6: Commit**

```bash
git add prisma
git commit -m "feat: add ETA and trial fields to schema with merchant backfill"
```

---

### Task 2: Pure ETA math module (TDD)

**Files:**
- Create: `src/lib/eta.ts`
- Test: `src/lib/eta.test.ts`

**Interfaces:**
- Produces (exact exports later tasks import):
  - `interface StoreEtaStats { throughputPerMin: number | null; avgPrepMins: number | null; samples: number }`
  - `computeStoreStats(readyOrders: { readyAt: Date; startedAt: Date }[], now: Date): StoreEtaStats`
  - `computeEtaMins(inputs: { ordersAhead: number; stats: StoreEtaStats; fallbackPrepMins: number; maxConcurrentOrders: number; etaAdjustMins?: number; queueDelayMins?: number }): number`
  - `projectReadyAt(order: { status: string; preparingAt: Date | null; etaAdjustMins: number }, ordersAhead: number, stats: StoreEtaStats, fallbackPrepMins: number, maxConcurrentOrders: number, now: Date): Date`
  - `shouldRevise(promisedReadyAt: Date, projectedReadyAt: Date, originalWaitMins: number | null): boolean`
  - `isDelayed(confirmedAt: Date | null, estimatedWaitMins: number | null, estimatedReadyAt: Date | null): boolean`
  - `remainingMins(estimatedReadyAt: Date, now: Date): number`
  - Constants: `ETA_STATS_WINDOW_MS`, `MIN_THROUGHPUT_SAMPLES = 3`, `DELAY_MIN_DRIFT_MINS = 3`, `DELAY_DRIFT_RATIO = 0.2`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/eta.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  computeStoreStats,
  computeEtaMins,
  projectReadyAt,
  shouldRevise,
  isDelayed,
  remainingMins,
  MIN_THROUGHPUT_SAMPLES,
} from "./eta";

const NOW = new Date("2026-08-02T12:00:00Z");
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const minsAhead = (m: number) => new Date(NOW.getTime() + m * 60_000);

describe("computeStoreStats", () => {
  it("returns null stats below the sample floor", () => {
    const stats = computeStoreStats(
      [{ readyAt: minsAgo(5), startedAt: minsAgo(13) }],
      NOW
    );
    expect(stats.throughputPerMin).toBeNull();
    expect(stats.avgPrepMins).toBeNull();
    expect(stats.samples).toBe(1);
  });

  it("computes throughput and avg prep from recent READY orders", () => {
    // 4 orders went READY over the last 30 min, each took 8 min to prep
    const readyOrders = [30, 20, 10, 5].map((m) => ({
      readyAt: minsAgo(m),
      startedAt: minsAgo(m + 8),
    }));
    const stats = computeStoreStats(readyOrders, NOW);
    expect(stats.samples).toBe(4);
    // 4 orders over a 30-minute span
    expect(stats.throughputPerMin).toBeCloseTo(4 / 30, 5);
    expect(stats.avgPrepMins).toBeCloseTo(8, 5);
  });

  it("ignores orders readied outside the 60-minute window", () => {
    const readyOrders = [
      { readyAt: minsAgo(90), startedAt: minsAgo(100) },
      { readyAt: minsAgo(10), startedAt: minsAgo(18) },
    ];
    const stats = computeStoreStats(readyOrders, NOW);
    expect(stats.samples).toBe(1);
    expect(stats.throughputPerMin).toBeNull();
  });

  it("clamps negative prep durations to zero contribution", () => {
    const readyOrders = [10, 8, 6].map((m) => ({
      readyAt: minsAgo(m),
      startedAt: minsAgo(m - 1), // startedAt AFTER readyAt (bad data)
    }));
    const stats = computeStoreStats(readyOrders, NOW);
    // avg clamps up to the 1-minute floor rather than going negative
    expect(stats.avgPrepMins).toBeGreaterThanOrEqual(1);
  });
});

describe("computeEtaMins", () => {
  const stats = { throughputPerMin: 0.4, avgPrepMins: 8, samples: 5 }; // 1 order per 2.5 min

  it("uses throughput for queue clearance plus own prep", () => {
    // 4 ahead ÷ 0.4/min = 10 min clearance + 8 prep = 18
    expect(
      computeEtaMins({ ordersAhead: 4, stats, fallbackPrepMins: 10, maxConcurrentOrders: 5 })
    ).toBe(18);
  });

  it("falls back to batch model when throughput is unknown", () => {
    const cold = { throughputPerMin: null, avgPrepMins: null, samples: 0 };
    // ceil(4/5) = 1 batch × 10 + 10 own prep = 20
    expect(
      computeEtaMins({ ordersAhead: 4, stats: cold, fallbackPrepMins: 10, maxConcurrentOrders: 5 })
    ).toBe(20);
  });

  it("adds manual and store-wide delays", () => {
    expect(
      computeEtaMins({
        ordersAhead: 0, stats, fallbackPrepMins: 10, maxConcurrentOrders: 5,
        etaAdjustMins: 20, queueDelayMins: 10,
      })
    ).toBe(38); // 0 clearance + 8 prep + 20 + 10
  });

  it("never returns less than 1 minute", () => {
    const cold = { throughputPerMin: null, avgPrepMins: null, samples: 0 };
    expect(
      computeEtaMins({ ordersAhead: 0, stats: cold, fallbackPrepMins: 0, maxConcurrentOrders: 5 })
    ).toBe(1);
  });
});

describe("projectReadyAt", () => {
  const stats = { throughputPerMin: 0.5, avgPrepMins: 10, samples: 5 };

  it("projects from preparingAt for orders already cooking", () => {
    const order = { status: "PREPARING", preparingAt: minsAgo(4), etaAdjustMins: 0 };
    const projected = projectReadyAt(order, 0, stats, 10, 5, NOW);
    // started 4 min ago + 10 min avg prep = 6 min from now
    expect(projected.getTime()).toBe(minsAhead(6).getTime());
  });

  it("never projects a cooking order earlier than one minute from now", () => {
    const order = { status: "PREPARING", preparingAt: minsAgo(30), etaAdjustMins: 0 };
    const projected = projectReadyAt(order, 0, stats, 10, 5, NOW);
    expect(projected.getTime()).toBe(minsAhead(1).getTime());
  });

  it("projects queued orders through the full estimate", () => {
    const order = { status: "PAID", preparingAt: null, etaAdjustMins: 0 };
    const projected = projectReadyAt(order, 2, stats, 10, 5, NOW);
    // 2 ÷ 0.5 = 4 clearance + 10 prep = 14 min
    expect(projected.getTime()).toBe(minsAhead(14).getTime());
  });
});

describe("shouldRevise", () => {
  it("does not revise inside the max(3 min, 20%) threshold", () => {
    // original promise 10 min → threshold is max(3, 2) = 3 min
    expect(shouldRevise(minsAhead(5), minsAhead(7), 10)).toBe(false);
    expect(shouldRevise(minsAhead(5), minsAhead(8), 10)).toBe(false); // exactly 3 — not over
  });

  it("revises when drift exceeds the threshold", () => {
    expect(shouldRevise(minsAhead(5), minsAhead(9), 10)).toBe(true);
  });

  it("uses the 20% arm for long original estimates", () => {
    // original 30 min → threshold 6 min
    expect(shouldRevise(minsAhead(5), minsAhead(10), 30)).toBe(false);
    expect(shouldRevise(minsAhead(5), minsAhead(12), 30)).toBe(true);
  });
});

describe("isDelayed", () => {
  it("is false when the promise never moved", () => {
    // confirmed 5 min ago with a 15-minute promise, still promised at +10
    expect(isDelayed(minsAgo(5), 15, minsAhead(10))).toBe(false);
  });

  it("is true once the current promise exceeds the original by over a minute", () => {
    expect(isDelayed(minsAgo(5), 15, minsAhead(20))).toBe(true);
  });

  it("is false when any input is missing", () => {
    expect(isDelayed(null, 15, minsAhead(20))).toBe(false);
    expect(isDelayed(minsAgo(5), null, minsAhead(20))).toBe(false);
    expect(isDelayed(minsAgo(5), 15, null)).toBe(false);
  });
});

describe("remainingMins", () => {
  it("rounds up and clamps at zero", () => {
    expect(remainingMins(new Date(NOW.getTime() + 90_000), NOW)).toBe(2);
    expect(remainingMins(minsAgo(5), NOW)).toBe(0);
  });
});

describe("constants", () => {
  it("requires at least 3 samples", () => {
    expect(MIN_THROUGHPUT_SAMPLES).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/eta.test.ts`
Expected: FAIL — `Cannot find module './eta'` (or equivalent).

- [ ] **Step 3: Implement `src/lib/eta.ts`**

```typescript
// =============================================================================
// ETA Engine — pure wait-time math. No I/O; callers supply the data.
//
// Model: ETA = (orders ahead ÷ measured throughput) + own prep time
//            + per-order manual bump + store-wide delay.
// Throughput and avg prep come from orders marked READY in the trailing
// window; below the sample floor we fall back to the legacy batch model
// (ceil(ahead / maxConcurrentOrders) × prep) driven by store settings.
// =============================================================================

export const ETA_STATS_WINDOW_MS = 60 * 60 * 1000;
export const MIN_THROUGHPUT_SAMPLES = 3;
export const DELAY_MIN_DRIFT_MINS = 3;
export const DELAY_DRIFT_RATIO = 0.2;

export interface StoreEtaStats {
  throughputPerMin: number | null;
  avgPrepMins: number | null;
  samples: number;
}

export function computeStoreStats(
  readyOrders: { readyAt: Date; startedAt: Date }[],
  now: Date
): StoreEtaStats {
  const cutoff = now.getTime() - ETA_STATS_WINDOW_MS;
  const recent = readyOrders.filter((o) => o.readyAt.getTime() >= cutoff);
  if (recent.length < MIN_THROUGHPUT_SAMPLES) {
    return { throughputPerMin: null, avgPrepMins: null, samples: recent.length };
  }

  const prepTotalMs = recent.reduce(
    (sum, o) => sum + Math.max(0, o.readyAt.getTime() - o.startedAt.getTime()),
    0
  );
  const earliestReady = Math.min(...recent.map((o) => o.readyAt.getTime()));
  const spanMins = Math.max(1, (now.getTime() - earliestReady) / 60_000);

  return {
    throughputPerMin: recent.length / spanMins,
    avgPrepMins: Math.max(1, prepTotalMs / recent.length / 60_000),
    samples: recent.length,
  };
}

export interface EtaInputs {
  ordersAhead: number;
  stats: StoreEtaStats;
  fallbackPrepMins: number;
  maxConcurrentOrders: number;
  etaAdjustMins?: number;
  queueDelayMins?: number;
}

export function computeEtaMins(inputs: EtaInputs): number {
  const { ordersAhead, stats, fallbackPrepMins, maxConcurrentOrders } = inputs;
  const prep = stats.avgPrepMins ?? fallbackPrepMins;
  const clearance =
    stats.throughputPerMin != null
      ? ordersAhead / stats.throughputPerMin
      : Math.ceil(ordersAhead / Math.max(1, maxConcurrentOrders)) * prep;
  const total =
    clearance + prep + (inputs.etaAdjustMins ?? 0) + (inputs.queueDelayMins ?? 0);
  return Math.max(1, Math.ceil(total));
}

export function projectReadyAt(
  order: { status: string; preparingAt: Date | null; etaAdjustMins: number },
  ordersAhead: number,
  stats: StoreEtaStats,
  fallbackPrepMins: number,
  maxConcurrentOrders: number,
  now: Date
): Date {
  const prep = stats.avgPrepMins ?? fallbackPrepMins;
  if (order.status === "PREPARING" && order.preparingAt) {
    const done =
      order.preparingAt.getTime() + (prep + order.etaAdjustMins) * 60_000;
    return new Date(Math.max(now.getTime() + 60_000, done));
  }
  const mins = computeEtaMins({
    ordersAhead,
    stats,
    fallbackPrepMins,
    maxConcurrentOrders,
    etaAdjustMins: order.etaAdjustMins,
  });
  return new Date(now.getTime() + mins * 60_000);
}

/**
 * The promise only moves when the projection drifts past it by more than
 * max(3 minutes, 20% of the original estimate) — revising on every tick
 * would thrash the customer's countdown.
 */
export function shouldRevise(
  promisedReadyAt: Date,
  projectedReadyAt: Date,
  originalWaitMins: number | null
): boolean {
  const thresholdMs =
    Math.max(DELAY_MIN_DRIFT_MINS, (originalWaitMins ?? 0) * DELAY_DRIFT_RATIO) *
    60_000;
  return projectedReadyAt.getTime() - promisedReadyAt.getTime() > thresholdMs;
}

/**
 * Delayed = the current promise has moved more than a minute past the
 * original one (estimatedWaitMins is stamped once at confirmation and
 * never updated, so the delta IS the delay).
 */
export function isDelayed(
  confirmedAt: Date | null,
  estimatedWaitMins: number | null,
  estimatedReadyAt: Date | null
): boolean {
  if (!confirmedAt || estimatedWaitMins == null || !estimatedReadyAt) return false;
  const originalReadyAt = confirmedAt.getTime() + estimatedWaitMins * 60_000;
  return estimatedReadyAt.getTime() - originalReadyAt > 60_000;
}

export function remainingMins(estimatedReadyAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((estimatedReadyAt.getTime() - now.getTime()) / 60_000));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/eta.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/eta.ts src/lib/eta.test.ts
git commit -m "feat: add pure ETA engine with throughput model and delay rule"
```

---

### Task 3: ETA DB service with 30s cache

**Files:**
- Create: `src/lib/eta-service.ts`

**Interfaces:**
- Consumes: everything from Task 2's `src/lib/eta.ts`; Task 1's `Store.queueDelayMins/queueDelayReason`.
- Produces:
  - `interface StoreEtaContext { stats: StoreEtaStats; avgPrepTimeMins: number; maxConcurrentOrders: number; queueDelayMins: number; queueDelayReason: string | null }`
  - `getStoreEtaContext(storeId: string): Promise<StoreEtaContext | null>` (cached 30s)
  - `estimateForNewOrder(storeId: string): Promise<number | null>` — minutes for an order confirmed right now
  - `invalidateEtaCache(storeId: string): void`

- [ ] **Step 1: Implement `src/lib/eta-service.ts`**

```typescript
// =============================================================================
// ETA Service — DB-backed store stats for the ETA engine, cached in-memory
// for 30s so the 3-second SSE poll stays cheap. Same in-process cache
// approach as rate-limit.ts; fine on the single Railway node.
// =============================================================================

import prisma from "@/lib/prisma";
import {
  computeStoreStats,
  computeEtaMins,
  ETA_STATS_WINDOW_MS,
  type StoreEtaStats,
} from "@/lib/eta";
import { logger } from "@/lib/logger";

const CACHE_TTL_MS = 30_000;

export interface StoreEtaContext {
  stats: StoreEtaStats;
  avgPrepTimeMins: number;
  maxConcurrentOrders: number;
  queueDelayMins: number;
  queueDelayReason: string | null;
}

const cache = new Map<string, { ctx: StoreEtaContext; expiresAt: number }>();

export function invalidateEtaCache(storeId: string): void {
  cache.delete(storeId);
}

export async function getStoreEtaContext(
  storeId: string
): Promise<StoreEtaContext | null> {
  const hit = cache.get(storeId);
  if (hit && hit.expiresAt > Date.now()) return hit.ctx;

  const now = new Date();
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      avgPrepTimeMins: true,
      maxConcurrentOrders: true,
      queueDelayMins: true,
      queueDelayReason: true,
    },
  });
  if (!store) return null;

  const readyRows = await prisma.order.findMany({
    where: {
      storeId,
      readyAt: { gte: new Date(now.getTime() - ETA_STATS_WINDOW_MS) },
    },
    select: { readyAt: true, preparingAt: true, confirmedAt: true, paidAt: true },
  });

  // Prep is measured from when cooking actually started; confirmedAt/paidAt
  // are fallbacks for legacy rows that skipped straight to READY.
  const samples = readyRows.flatMap((r) => {
    const startedAt = r.preparingAt ?? r.confirmedAt ?? r.paidAt;
    return r.readyAt && startedAt ? [{ readyAt: r.readyAt, startedAt }] : [];
  });

  const ctx: StoreEtaContext = {
    stats: computeStoreStats(samples, now),
    avgPrepTimeMins: store.avgPrepTimeMins,
    maxConcurrentOrders: store.maxConcurrentOrders,
    queueDelayMins: store.queueDelayMins,
    queueDelayReason: store.queueDelayReason,
  };
  cache.set(storeId, { ctx, expiresAt: Date.now() + CACHE_TTL_MS });
  return ctx;
}

/**
 * Estimate for an order being confirmed right now. Returns null on any
 * failure — an estimate must never block a confirmation.
 */
export async function estimateForNewOrder(storeId: string): Promise<number | null> {
  try {
    const ctx = await getStoreEtaContext(storeId);
    if (!ctx) return null;
    const ordersAhead = await prisma.order.count({
      where: { storeId, status: { in: ["PAID", "ACCEPTED", "PREPARING"] } },
    });
    return computeEtaMins({
      ordersAhead,
      stats: ctx.stats,
      fallbackPrepMins: ctx.avgPrepTimeMins,
      maxConcurrentOrders: ctx.maxConcurrentOrders,
      queueDelayMins: ctx.queueDelayMins,
    });
  } catch (error) {
    logger.error("ETA estimate failed (non-fatal):", error);
    return null;
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/eta-service.ts
git commit -m "feat: add cached store ETA context service"
```

---

### Task 4: Stamp the promise at confirmation

**Files:**
- Modify: `src/app/api/orders/[orderId]/route.ts` (the `confirmOrder` function, lines 118–163)

**Interfaces:**
- Consumes: `estimateForNewOrder` from Task 3.
- Produces: confirmed orders carry `estimatedWaitMins` (original promise, minutes) and `estimatedReadyAt` (current promise, absolute). Both null if estimation failed.

- [ ] **Step 1: Import the service**

At the top of `src/app/api/orders/[orderId]/route.ts`, add:

```typescript
import { estimateForNewOrder } from "@/lib/eta-service";
```

- [ ] **Step 2: Compute and stamp the estimate in `confirmOrder`**

Replace the start of `confirmOrder` (from `const queueNumber = ...` down to the end of the `confirmed` object literal) with:

```typescript
  const queueNumber = await assignQueueNumber(storeId);
  const now = new Date();

  // The customer's promise, made once at confirmation. estimateForNewOrder
  // returns null on failure — a missing estimate must never block a confirm.
  const etaMins = await estimateForNewOrder(storeId);

  // Hoisted so the degraded response below can echo exactly what was committed.
  const confirmed = {
    status: "PAID",
    queueNumber,
    confirmedAt: now,
    ...(etaMins != null
      ? {
          estimatedWaitMins: etaMins,
          estimatedReadyAt: new Date(now.getTime() + etaMins * 60_000),
        }
      : {}),
    ...(paymentMethod === "CASH" ? {} : { paymentStatus: "PAID", paidAt: now }),
  };
```

(Everything after the `confirmed` literal — the `updateMany`, race handling, and degraded-response re-read — stays exactly as it is.)

- [ ] **Step 3: Verify typecheck + existing tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/orders/[orderId]/route.ts"
git commit -m "feat: stamp wait-time promise when confirming an order"
```

---

### Task 5: Stream ETA + lazy delay revision over SSE

**Files:**
- Modify: `src/app/api/queue/stream/route.ts`
- Modify: `src/hooks/useOrderStream.ts` (lines 7–20, the `OrderStreamUpdate` interface)

**Interfaces:**
- Consumes: `getStoreEtaContext` (Task 3); `projectReadyAt`, `shouldRevise`, `isDelayed`, `remainingMins` (Task 2).
- Produces: `ORDER_UPDATE` SSE payload gains `etaMinutes: number | null`, `estimatedReadyAt: string | null`, `delayed: boolean`, `delayReason: string | null`. `STORE_QUEUE_UPDATE` orders automatically carry the new Order columns (the store branch does `findMany` without `select`).

- [ ] **Step 1: Extend the public field projection and imports**

In `src/app/api/queue/stream/route.ts`, add to imports:

```typescript
import { getStoreEtaContext } from "@/lib/eta-service";
import { isDelayed, projectReadyAt, remainingMins, shouldRevise } from "@/lib/eta";
```

Extend `ORDER_PUBLIC_FIELDS` (lines 24–36) with the fields the ETA logic needs — none of these are PII:

```typescript
const ORDER_PUBLIC_FIELDS = {
  id: true,
  storeId: true,
  queueNumber: true,
  status: true,
  paymentStatus: true,
  estimatedWaitMins: true,
  estimatedReadyAt: true,
  etaAdjustMins: true,
  delayReason: true,
  confirmedAt: true,
  paidAt: true,
  acceptedAt: true,
  preparingAt: true,
  readyAt: true,
  completedAt: true,
  createdAt: true,
} as const;
```

- [ ] **Step 2: Add the revision + payload logic to the single-order poll branch**

Replace the single-order branch body (lines 101–114, the `if (orderId) { ... }` block inside `poll`) with:

```typescript
          if (orderId) {
            // Single-order stream: project only safe fields — no phone/name
            let order = await prisma.order.findUnique({
              where: { id: orderId },
              select: ORDER_PUBLIC_FIELDS,
            });

            if (order) {
              const active = ["PAID", "ACCEPTED", "PREPARING"].includes(order.status);

              // Lazy delay revision: when the measured pace has drifted past
              // the promise, push the promise out (CAS on the old value so
              // concurrent streams write it exactly once) and re-read.
              if (active && order.estimatedReadyAt) {
                try {
                  const ctx = await getStoreEtaContext(order.storeId);
                  if (ctx) {
                    const now = new Date();
                    const ordersAhead =
                      order.queueNumber == null
                        ? 0
                        : await prisma.order.count({
                            where: {
                              storeId: order.storeId,
                              queueNumber: { lt: order.queueNumber },
                              status: { in: ["PAID", "ACCEPTED", "PREPARING"] },
                            },
                          });
                    const projected = projectReadyAt(
                      order,
                      ordersAhead,
                      ctx.stats,
                      ctx.avgPrepTimeMins,
                      ctx.maxConcurrentOrders,
                      now
                    );
                    if (shouldRevise(order.estimatedReadyAt, projected, order.estimatedWaitMins)) {
                      await prisma.order.updateMany({
                        where: { id: orderId, estimatedReadyAt: order.estimatedReadyAt },
                        data: { estimatedReadyAt: projected },
                      });
                      order = await prisma.order.findUnique({
                        where: { id: orderId },
                        select: ORDER_PUBLIC_FIELDS,
                      });
                    }
                  }
                } catch (etaError) {
                  logger.error("ETA revision failed (non-fatal):", etaError);
                }
              }

              if (order) {
                const now = new Date();
                sendEvent({
                  type: "ORDER_UPDATE",
                  ...order,
                  etaMinutes:
                    active && order.estimatedReadyAt
                      ? remainingMins(order.estimatedReadyAt, now)
                      : null,
                  delayed: isDelayed(order.confirmedAt, order.estimatedWaitMins, order.estimatedReadyAt),
                });

                if (order.status === "COMPLETED" || order.status === "CANCELLED") {
                  close();
                }
              }
            }
          } else if (storeId) {
```

(The `else if (storeId)` branch is unchanged — `findMany` without `select` already returns the new columns, and `toPlainOrder` passes unknown fields through.)

- [ ] **Step 3: Extend the client stream type**

In `src/hooks/useOrderStream.ts`, add to `OrderStreamUpdate` (after `estimatedWaitMins`):

```typescript
  estimatedReadyAt: string | null;
  etaMinutes: number | null;
  delayed: boolean;
  delayReason: string | null;
```

- [ ] **Step 4: Verify typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/queue/stream/route.ts src/hooks/useOrderStream.ts
git commit -m "feat: stream live ETA with lazy delay revision"
```

---

### Task 6: Merchant bump APIs (per-order + store-wide)

**Files:**
- Modify: `src/lib/validators.ts` (add schemas near `updateOrderStatusSchema`, ~line 175)
- Create: `src/app/api/orders/[orderId]/eta/route.ts`
- Create: `src/app/api/stores/[storeId]/queue-delay/route.ts`

**Interfaces:**
- Consumes: Task 1 fields; `invalidateEtaCache` (Task 3).
- Produces:
  - `orderEtaBumpSchema` → body `{ addMins: 1..120, reason?: string ≤140 }`
  - `storeQueueDelaySchema` → body `{ delayMins: 0..180, reason?: string ≤140 }` (absolute set; 0 clears)
  - `PATCH /api/orders/[orderId]/eta` and `PATCH /api/stores/[storeId]/queue-delay`, both owner-or-admin gated, both returning `{ success: true, data: ... }`.

- [ ] **Step 1: Add validators**

In `src/lib/validators.ts`, after `updateOrderStatusSchema`'s closing, add:

```typescript
export const orderEtaBumpSchema = z.object({
  addMins: z.number().int().min(1).max(120),
  reason: z.string().trim().max(140).optional(),
});

export const storeQueueDelaySchema = z.object({
  delayMins: z.number().int().min(0).max(180),
  reason: z.string().trim().max(140).optional(),
});
```

And with the other type exports at the bottom:

```typescript
export type OrderEtaBumpInput = z.infer<typeof orderEtaBumpSchema>;
export type StoreQueueDelayInput = z.infer<typeof storeQueueDelaySchema>;
```

- [ ] **Step 2: Create the per-order bump route**

Create `src/app/api/orders/[orderId]/eta/route.ts`:

```typescript
// =============================================================================
// Order ETA Bump — merchant adds time to a single order's promise
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { orderEtaBumpSchema } from "@/lib/validators";
import { toPlainOrder } from "@/lib/serializers";
import { logger } from "@/lib/logger";

const ACTIVE_STATUSES = ["PAID", "ACCEPTED", "PREPARING"];

// PATCH /api/orders/[orderId]/eta — push this order's promise out by addMins
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = orderEtaBumpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { addMins, reason } = parsed.data;

    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        estimatedReadyAt: true,
        store: { select: { ownerId: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }
    if (session.user.role !== "ADMIN" && existing.store.ownerId !== session.user.id) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    if (!ACTIVE_STATUSES.includes(existing.status)) {
      return NextResponse.json(
        { success: false, error: "Only active orders can be delayed" },
        { status: 422 }
      );
    }

    // Push from the current promise, or from now if none was ever stamped.
    const base = existing.estimatedReadyAt ?? new Date();
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        etaAdjustMins: { increment: addMins },
        estimatedReadyAt: new Date(base.getTime() + addMins * 60_000),
        ...(reason ? { delayReason: reason } : {}),
      },
    });

    return NextResponse.json({ success: true, data: toPlainOrder(updated) });
  } catch (error) {
    logger.error("Order ETA bump error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create the store-wide delay route**

Create `src/app/api/stores/[storeId]/queue-delay/route.ts`:

```typescript
// =============================================================================
// Store Queue Delay — merchant shifts every active order's promise at once
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { storeQueueDelaySchema } from "@/lib/validators";
import { invalidateEtaCache } from "@/lib/eta-service";
import { logger } from "@/lib/logger";

// PATCH /api/stores/[storeId]/queue-delay — set (or clear, with 0) the
// store-wide delay. Active orders' promises shift by the delta; new orders
// pick the delay up through the estimate itself.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const { storeId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = storeQueueDelaySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { delayMins, reason } = parsed.data;

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { ownerId: true, queueDelayMins: true },
    });
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }
    if (session.user.role !== "ADMIN" && store.ownerId !== session.user.id) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const deltaMins = delayMins - store.queueDelayMins;

    await prisma.$transaction(async (tx) => {
      await tx.store.update({
        where: { id: storeId },
        data: {
          queueDelayMins: delayMins,
          queueDelayReason: delayMins === 0 ? null : (reason ?? undefined),
        },
      });
      if (deltaMins !== 0) {
        // Relative shift needs raw SQL — Prisma has no column-relative update.
        await tx.$executeRaw(Prisma.sql`
          UPDATE orders
          SET estimated_ready_at = estimated_ready_at + make_interval(mins => ${deltaMins}),
              delay_reason = COALESCE(${reason ?? null}, delay_reason)
          WHERE store_id = ${storeId}
            AND status IN ('PAID', 'ACCEPTED', 'PREPARING')
            AND estimated_ready_at IS NOT NULL
        `);
      }
    });

    invalidateEtaCache(storeId);

    return NextResponse.json({
      success: true,
      data: { storeId, queueDelayMins: delayMins, queueDelayReason: delayMins === 0 ? null : (reason ?? null) },
    });
  } catch (error) {
    logger.error("Store queue delay error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verify typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators.ts "src/app/api/orders/[orderId]/eta" "src/app/api/stores/[storeId]/queue-delay"
git commit -m "feat: add per-order and store-wide ETA bump endpoints"
```

---

### Task 7: Customer tracking page — countdown + friendly delay banner

**Files:**
- Modify: `src/app/store/[slug]/order/[orderId]/page.tsx`

**Interfaces:**
- Consumes: `OrderStreamUpdate` fields from Task 5 (`etaMinutes`, `delayed`, `delayReason`).

- [ ] **Step 1: Track the new stream fields**

In the page's `OrderData` interface (~line 24–33), after `estimatedWaitMins`, add:

```typescript
  etaMinutes?: number | null;
  delayed?: boolean;
  delayReason?: string | null;
```

In the stream-update `useEffect` (~lines 99–114), extend the cast and the merge:

```typescript
      const update = streamData as {
        status: string; queueNumber: number; estimatedWaitMins: number; paymentStatus: string;
        etaMinutes: number | null; delayed: boolean; delayReason: string | null;
      };
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              status: update.status,
              queueNumber: update.queueNumber,
              estimatedWaitMins: update.estimatedWaitMins,
              paymentStatus: update.paymentStatus,
              etaMinutes: update.etaMinutes,
              delayed: update.delayed,
              delayReason: update.delayReason,
            }
          : null
      );
```

- [ ] **Step 2: Show the live countdown**

Replace the estimated-wait line (lines 201–206) with a live value that prefers the streamed `etaMinutes` and falls back to the static promise before the first stream frame arrives:

```tsx
              {!isCancelled && !isCompleted && order.status !== "READY" && (
                <p className="text-xs text-[var(--color-text-muted)] flex items-center justify-center gap-1.5">
                  <Clock className="h-3 w-3" /> Ready in about{" "}
                  <span className="text-[var(--color-primary)] font-bold">
                    {formatWaitTime(order.etaMinutes ?? order.estimatedWaitMins ?? 0)}
                  </span>
                </p>
              )}
```

- [ ] **Step 3: Add the friendly delay banner**

Directly above the queue-number `<section>` (i.e. right before the `{isAwaitingConfirmation ? (` ternary at ~line 179), add:

```tsx
        {/* Friendly delay notice — appears once the promise has been revised */}
        {order.delayed && !isCancelled && !isCompleted && order.status !== "READY" && (
          <div className="p-5 bg-amber-500/10 border border-amber-500/30 rounded-3xl flex items-start gap-4 animate-fade-in">
            <Clock className="h-8 w-8 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-amber-500">Sorry for the wait! 🙏</p>
              <p className="text-sm text-amber-500/80 mt-1">
                The kitchen&apos;s a little busy — your order should now be ready in about{" "}
                <span className="font-bold">{formatWaitTime(order.etaMinutes ?? 0)}</span>.
                {order.delayReason ? ` (${order.delayReason})` : ""}
              </p>
            </div>
          </div>
        )}
```

- [ ] **Step 4: Verify typecheck, then verify live**

Run: `npm run typecheck`
Expected: PASS.

Then verify end-to-end against the dev server (seeded store):
1. `npm run dev` in the background.
2. Place an order on the seeded store, confirm it from the dashboard, and check the tracking page shows "Ready in about Xm".
3. `curl -s -X PATCH localhost:3000/api/orders/<id>/eta` with a merchant session would 401 from curl — instead bump via the dashboard UI once Task 8 lands, or directly in DB: `UPDATE orders SET estimated_ready_at = estimated_ready_at + interval '20 minutes' WHERE id = '<id>';` and confirm the amber banner appears within ~3s.

- [ ] **Step 5: Commit**

```bash
git add "src/app/store/[slug]/order/[orderId]/page.tsx"
git commit -m "feat: live countdown and friendly delay banner on order tracking"
```

---

### Task 8: Merchant queue — ETA display, overdue highlight, bump + delay-all controls

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `PATCH /api/orders/[orderId]/eta`, `PATCH /api/stores/[storeId]/queue-delay` (Task 6); `estimatedReadyAt`/`delayReason` on streamed orders (Task 5). `/api/stores` already returns the full store row including `queueDelayMins`.

- [ ] **Step 1: Extend the local `Order` interface** (lines 20–32), adding:

```typescript
  estimatedReadyAt?: string | null;
  delayReason?: string | null;
```

- [ ] **Step 2: Track store delay state**

Next to the `ordersPaused` state (~line 55), add:

```typescript
  const [queueDelayMins, setQueueDelayMins] = useState(0);
  const [delayBusy, setDelayBusy] = useState(false);
```

In `fetchStore` (lines 65–76), after `setOrdersPaused(...)`, add:

```typescript
        setQueueDelayMins(data.data[0].queueDelayMins ?? 0);
```

- [ ] **Step 3: Add bump + delay-all handlers** (after `rejectOrder`, ~line 213):

```typescript
  // window.prompt matches the board's existing confirm() idiom. Cancel aborts;
  // empty string bumps without a reason.
  async function bumpOrderEta(orderId: string, addMins: number) {
    const reason = window.prompt(
      `Add ${addMins} min to this order. Reason shown to the customer (optional):`,
      ""
    );
    if (reason === null) return;
    try {
      const res = await fetch(`/api/orders/${orderId}/eta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addMins, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Could not add time — please try again.");
      } else {
        await fetchOrders();
      }
    } catch {
      setActionError("Network problem — the delay was not saved. Please retry.");
    }
  }

  async function setStoreDelay(delayMins: number) {
    if (!storeId || delayBusy) return;
    let reason: string | null = "";
    if (delayMins > 0) {
      reason = window.prompt(
        "Delay ALL active orders. Reason shown to customers (optional):",
        ""
      );
      if (reason === null) return;
    }
    setDelayBusy(true);
    try {
      const res = await fetch(`/api/stores/${storeId}/queue-delay`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delayMins, ...(reason && reason.trim() ? { reason: reason.trim() } : {}) }),
      });
      if (res.ok) {
        setQueueDelayMins(delayMins);
        await fetchOrders();
      } else {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Could not update the store delay — please try again.");
      }
    } catch {
      setActionError("Network problem — the store delay was not saved. Please retry.");
    } finally {
      setDelayBusy(false);
    }
  }
```

- [ ] **Step 4: Header delay-all control**

In the header button group (the `div` with `flex items-center gap-2` at ~line 240, before the pause toggle), add:

```tsx
          {queueDelayMins > 0 ? (
            <button
              onClick={() => setStoreDelay(0)}
              disabled={delayBusy}
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-500 transition-colors hover:bg-amber-500/20 disabled:opacity-60"
            >
              Kitchen delayed +{queueDelayMins}m · Clear
            </button>
          ) : (
            <button
              onClick={() => setStoreDelay(10)}
              disabled={delayBusy}
              className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--color-bg-tertiary)]"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
            >
              Delay all +10m
            </button>
          )}
```

- [ ] **Step 5: ETA line + overdue highlight + bump buttons on cards**

Inside the card render (after the Total block ending ~line 411, before the Actions block), for active columns only, add:

```tsx
                      {/* ETA + delay controls (active orders only) */}
                      {(col.key === "PAID" || col.key === "PREPARING") && (
                        <div className="mt-3 space-y-2">
                          {order.estimatedReadyAt && (() => {
                            const msLeft = new Date(order.estimatedReadyAt).getTime() - Date.now();
                            const overdue = msLeft < 0;
                            const mins = Math.ceil(Math.abs(msLeft) / 60_000);
                            return (
                              <p
                                className={`text-xs font-bold ${overdue ? "text-red-500" : "text-[var(--color-text-secondary)]"}`}
                              >
                                {overdue ? `Overdue by ${mins}m` : `Promised in ${mins}m`}
                                {order.delayReason ? ` · ${order.delayReason}` : ""}
                              </p>
                            );
                          })()}
                          <div className="flex gap-1.5">
                            {[5, 10, 20].map((m) => (
                              <button
                                key={m}
                                onClick={() => bumpOrderEta(order.id, m)}
                                className="flex-1 rounded-md border px-2 py-1 text-[10px] font-bold transition-colors hover:bg-[var(--color-bg-tertiary)]"
                                style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
                              >
                                +{m}m
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
```

Additionally, make overdue cards visually pop: change the card wrapper `className` (line 326) to:

```tsx
                      className={`glass rounded-xl p-4 animate-slide-up ${
                        order.estimatedReadyAt &&
                        (col.key === "PAID" || col.key === "PREPARING") &&
                        new Date(order.estimatedReadyAt).getTime() < Date.now()
                          ? "ring-1 ring-red-500/40"
                          : ""
                      }`}
```

- [ ] **Step 6: Verify typecheck and live behavior**

Run: `npm run typecheck`
Expected: PASS.

Live check (dev server + seeded store): confirm an order → card shows "Promised in Xm"; click `+20m`, enter "frying a fresh batch" → customer tracking page shows the amber banner with the reason within ~3s; "Delay all +10m" shifts every active card; "Clear" resets.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: merchant ETA display with bump and store-wide delay controls"
```

---

### Task 9: Public wait endpoint + menu-page chip

**Files:**
- Create: `src/app/api/stores/[slug]/wait/route.ts`
- Modify: `src/app/store/[slug]/StoreMenuClient.tsx`

**Interfaces:**
- Consumes: `getStoreEtaContext` (Task 3), `computeEtaMins` (Task 2).
- Produces: `GET /api/stores/<slug>/wait` → `{ success: true, data: { waitMins: number } }` (404 for unknown slug).

**Note:** `src/app/api/stores/[storeId]/` and `[slug]` cannot coexist as sibling dynamic segments in one directory. Check `ls src/app/api/stores/` first — the existing param is `[storeId]`, so nest the public route under it as `src/app/api/stores/[storeId]/wait/route.ts` and treat the param value as a slug OR id is wrong; instead place the route at `src/app/api/store-wait/[slug]/route.ts` to avoid the conflict entirely. Use `src/app/api/store-wait/[slug]/route.ts`.

- [ ] **Step 1: Create `src/app/api/store-wait/[slug]/route.ts`**

```typescript
// =============================================================================
// Public Store Wait — "current wait ~X min" for the menu page. No auth;
// rate-limited; nothing sensitive in the response.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getStoreEtaContext } from "@/lib/eta-service";
import { computeEtaMins } from "@/lib/eta";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const WAIT_RATE_LIMIT = 30; // per minute per IP

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!checkRateLimit(`wait:${getClientIp(request.headers)}`, WAIT_RATE_LIMIT)) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const store = await prisma.store.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const ctx = await getStoreEtaContext(store.id);
    if (!ctx) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const ordersAhead = await prisma.order.count({
      where: { storeId: store.id, status: { in: ["PAID", "ACCEPTED", "PREPARING"] } },
    });

    const waitMins = computeEtaMins({
      ordersAhead,
      stats: ctx.stats,
      fallbackPrepMins: ctx.avgPrepTimeMins,
      maxConcurrentOrders: ctx.maxConcurrentOrders,
      queueDelayMins: ctx.queueDelayMins,
    });

    return NextResponse.json({ success: true, data: { waitMins } });
  } catch (error) {
    logger.error("Store wait error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Add the chip to StoreMenuClient**

In `src/app/store/[slug]/StoreMenuClient.tsx`, add state + polling after the existing `useState` block (~line 29):

```typescript
  const [waitMins, setWaitMins] = useState<number | null>(null);
```

Add a fetch effect after the existing `useEffect` (~line 41):

```typescript
  // Live wait estimate — refreshed every 30s while the menu is open.
  useEffect(() => {
    let cancelled = false;
    async function fetchWait() {
      try {
        const res = await fetch(`/api/store-wait/${store.slug}`);
        const json = await res.json();
        if (!cancelled && json?.success) setWaitMins(json.data.waitMins);
      } catch {
        // chip silently keeps its last value
      }
    }
    fetchWait();
    const id = setInterval(fetchWait, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [store.slug]);
```

Replace the static prep line (lines 72–74):

```tsx
              <p className="text-xs text-white/70 flex items-center gap-1">
                <Clock className="h-3 w-3" />{" "}
                {waitMins != null ? `~${waitMins} min wait` : `${store.avgPrepTimeMins} min prep`}
              </p>
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: PASS.

Live: `curl -s localhost:3000/api/store-wait/<seed-slug>` → `{"success":true,"data":{"waitMins":<n>}}`; menu page shows "~N min wait".

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/store-wait" "src/app/store/[slug]/StoreMenuClient.tsx"
git commit -m "feat: public current-wait endpoint and live menu chip"
```

---

### Task 10: Admin approve + early-bird (API + UI)

**Files:**
- Modify: `src/lib/validators.ts` (admin schemas section, ~line 235)
- Modify: `src/app/api/admin/merchants/route.ts` (GET select + row shape)
- Create: `src/app/api/admin/merchants/[userId]/trial/route.ts`
- Modify: `src/app/admin/merchants/page.tsx`

**Interfaces:**
- Produces:
  - `adminMerchantTrialSchema` → body `{ approve?: true, earlyBird?: boolean }` (at least one key required)
  - `PATCH /api/admin/merchants/[userId]/trial` — `approve: true` sets `isVerified: true` + `trialEndsAt = now + 7 days` (idempotent: skips if already verified); `earlyBird` sets the flag. Audit-logged (`ADMIN_MERCHANT_APPROVE`, `ADMIN_MERCHANT_EARLYBIRD`).
  - Merchant list rows gain `isVerified: boolean`, `trialEndsAt: string | null`, `earlyBird: boolean`.

- [ ] **Step 1: Add the validator** (in the `// ---- Admin Schemas ----` section):

```typescript
export const adminMerchantTrialSchema = z
  .object({
    approve: z.literal(true).optional(),
    earlyBird: z.boolean().optional(),
  })
  .refine((v) => v.approve !== undefined || v.earlyBird !== undefined, {
    message: "Nothing to update",
  });
```

- [ ] **Step 2: Expose the trial fields in the merchant list**

In `src/app/api/admin/merchants/route.ts` GET, extend the user `select`:

```typescript
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
      isVerified: true,
      trialEndsAt: true,
      earlyBird: true,
      stores: { select: { id: true, name: true, slug: true, status: true, createdAt: true } },
    },
```

And in the mapped row object add:

```typescript
        phone: u.phone,
        isVerified: u.isVerified,
        trialEndsAt: u.trialEndsAt,
        earlyBird: u.earlyBird,
```

- [ ] **Step 3: Create the trial route**

Create `src/app/api/admin/merchants/[userId]/trial/route.ts`:

```typescript
// =============================================================================
// Admin Merchant Trial API — approve a merchant / toggle early-bird
// =============================================================================
// The edge middleware only role-gates the /admin pages, not /api/admin, so
// every handler here re-checks the ADMIN role itself.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { adminMerchantTrialSchema } from "@/lib/validators";

const TRIAL_DAYS = 7;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  if (session.user.role !== "ADMIN") return "forbidden" as const;
  return session;
}

// PATCH /api/admin/merchants/[userId]/trial
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const gate = await requireAdmin();
  if (gate === null) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (gate === "forbidden") return NextResponse.json({ success: false, code: "FORBIDDEN", error: "Admin only" }, { status: 403 });

  const { userId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = adminMerchantTrialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isVerified: true },
  });
  if (!user || user.role !== "MERCHANT") {
    return NextResponse.json({ success: false, error: "Merchant not found" }, { status: 404 });
  }

  const approving = parsed.data.approve === true && !user.isVerified;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(approving
        ? {
            isVerified: true,
            trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
          }
        : {}),
      ...(parsed.data.earlyBird !== undefined ? { earlyBird: parsed.data.earlyBird } : {}),
    },
    select: { id: true, isVerified: true, trialEndsAt: true, earlyBird: true },
  });

  if (approving) {
    await prisma.auditLog.create({
      data: {
        actorId: gate.user.id,
        action: "ADMIN_MERCHANT_APPROVE",
        targetType: "user",
        targetId: userId,
      },
    });
  }
  if (parsed.data.earlyBird !== undefined) {
    await prisma.auditLog.create({
      data: {
        actorId: gate.user.id,
        action: "ADMIN_MERCHANT_EARLYBIRD",
        targetType: "user",
        targetId: userId,
      },
    });
  }

  return NextResponse.json({ success: true, data: updated });
}
```

- [ ] **Step 4: Admin UI**

In `src/app/admin/merchants/page.tsx`:

1. Extend `MerchantRow` (lines 12–26) with:

```typescript
  phone: string | null;
  isVerified: boolean;
  trialEndsAt: string | null;
  earlyBird: boolean;
```

2. Add a handler after `updateStatus` (~line 77):

```typescript
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const patchTrial = async (userId: string, body: { approve?: true; earlyBird?: boolean }) => {
    try {
      setPendingUserId(userId);
      const res = await fetch(`/api/admin/merchants/${userId}/trial`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Request failed");
      await fetchData();
    } catch (err) {
      console.error("Failed to update merchant trial", err);
    } finally {
      setPendingUserId(null);
    }
  };
```

3. In the Merchant cell (lines 140–143), show phone + trial state under the email:

```tsx
                  <td className="px-6 py-4">
                    <p className="font-bold">{m.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{m.email}</p>
                    {m.phone && <p className="text-xs text-[var(--color-text-muted)]">{m.phone}</p>}
                    <div className="mt-1 flex items-center gap-1.5">
                      {!m.isVerified ? (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest bg-amber-500/15 text-amber-500">
                          Pending approval
                        </span>
                      ) : m.trialEndsAt ? (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest bg-green-500/15 text-green-500">
                          Trial ends {new Date(m.trialEndsAt).toLocaleDateString("en-MY")}
                        </span>
                      ) : null}
                      {m.earlyBird && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                          Early bird
                        </span>
                      )}
                    </div>
                  </td>
```

4. In the Action cell (lines 174–193), above the suspend button, add:

```tsx
                    {!m.isVerified && (
                      <button
                        onClick={() => patchTrial(m.userId, { approve: true })}
                        disabled={pendingUserId === m.userId}
                        className="mr-2 rounded-lg px-3 py-2 text-xs font-bold text-white gradient-primary transition-all disabled:opacity-50"
                      >
                        {pendingUserId === m.userId ? "Saving…" : "Approve"}
                      </button>
                    )}
                    <button
                      onClick={() => patchTrial(m.userId, { earlyBird: !m.earlyBird })}
                      disabled={pendingUserId === m.userId}
                      className="mr-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50"
                      style={{
                        borderColor: m.earlyBird ? "var(--color-primary)" : "var(--color-border)",
                        color: m.earlyBird ? "var(--color-primary)" : "var(--color-text-secondary)",
                      }}
                    >
                      {m.earlyBird ? "Early bird ✓" : "Early bird"}
                    </button>
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck`
Expected: PASS.

Live: sign in as the seeded admin → `/admin/merchants` shows Pending/Trial badges, Approve sets a trial end 7 days out, Early bird toggles.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validators.ts src/app/api/admin/merchants "src/app/admin/merchants/page.tsx"
git commit -m "feat: admin merchant approval and early-bird toggle with audit log"
```

---

### Task 11: Pending-approval gate

**Files:**
- Create: `src/app/dashboard/PendingApproval.tsx`
- Modify: `src/app/dashboard/layout.tsx`

**Interfaces:**
- Consumes: `User.isVerified` (existing field, now backfilled by Task 1).

- [ ] **Step 1: Create the pending screen**

Create `src/app/dashboard/PendingApproval.tsx`:

```tsx
"use client";

// =============================================================================
// Pending Approval — friendly hold screen for unapproved merchants
// =============================================================================

import { signOut } from "next-auth/react";
import { Clock } from "lucide-react";

export default function PendingApproval() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div className="glass max-w-md rounded-3xl p-10 space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary">
          <Clock className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-2xl font-black tracking-tight">We&apos;re reviewing your registration</h1>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          Thanks for signing up for the QueLess closed trial! We personally review
          every new merchant — you&apos;ll hear from us shortly, usually within a day.
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">
          Questions? Reply to the message we sent you, or just check back soon.
        </p>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="rounded-xl border px-6 py-3 text-sm font-bold transition-colors hover:bg-[var(--color-bg-tertiary)]"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Gate the dashboard layout**

In `src/app/dashboard/layout.tsx`, add the imports and the fresh-DB check after the role check (line 24):

```typescript
import prisma from "@/lib/prisma";
import PendingApproval from "./PendingApproval";
```

```typescript
  // Fresh DB read, mirroring the fresh-role pattern above: the JWT can't be
  // trusted to know the merchant was approved after login.
  if (role === "MERCHANT") {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isVerified: true },
    });
    if (user && !user.isVerified) {
      return <PendingApproval />;
    }
  }
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: PASS.

Live: register a fresh merchant → dashboard shows the review screen; approve them in `/admin/merchants` → dashboard unlocks on refresh.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/PendingApproval.tsx src/app/dashboard/layout.tsx
git commit -m "feat: gate unapproved merchants behind a pending-review screen"
```

---

### Task 12: Trial-days helper (TDD) + account avatar plumbing

**Files:**
- Create: `src/lib/trial.ts`, `src/lib/trial.test.ts`
- Modify: `src/app/api/account/route.ts`, `src/lib/validators.ts` (updateAccountSchema), `src/app/api/upload/route.ts` (line 13), `src/app/dashboard/account/page.tsx`

**Interfaces:**
- Produces:
  - `trialStatus(trialEndsAt: Date | null, now: Date): { daysLeft: number; fraction: number; tone: "green" | "amber" | "red"; ended: boolean } | null` (null when no trial)
  - `/api/account` GET returns `avatarUrl`, `trialEndsAt`, `earlyBird`; PUT accepts `avatarUrl`
  - upload route accepts `kind: "avatar"`

- [ ] **Step 1: Write the failing trial test**

Create `src/lib/trial.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { trialStatus, TRIAL_LENGTH_DAYS } from "./trial";

const NOW = new Date("2026-08-02T12:00:00Z");
const daysAhead = (d: number) => new Date(NOW.getTime() + d * 24 * 60 * 60 * 1000);

describe("trialStatus", () => {
  it("returns null when there is no trial", () => {
    expect(trialStatus(null, NOW)).toBeNull();
  });

  it("reports a fresh 7-day trial as full and green", () => {
    const s = trialStatus(daysAhead(7), NOW);
    expect(s).toEqual({ daysLeft: 7, fraction: 1, tone: "green", ended: false });
  });

  it("rounds partial days up and clamps the fraction", () => {
    const s = trialStatus(daysAhead(2.5), NOW)!;
    expect(s.daysLeft).toBe(3);
    expect(s.fraction).toBeCloseTo(2.5 / TRIAL_LENGTH_DAYS, 5);
    expect(s.tone).toBe("amber"); // ≤ 3 days
  });

  it("goes red on the last day", () => {
    const s = trialStatus(daysAhead(0.5), NOW)!;
    expect(s.daysLeft).toBe(1);
    expect(s.tone).toBe("red");
  });

  it("marks an expired trial as ended with zero left", () => {
    const s = trialStatus(daysAhead(-1), NOW)!;
    expect(s).toEqual({ daysLeft: 0, fraction: 0, tone: "red", ended: true });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/trial.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/trial.ts`**

```typescript
// =============================================================================
// Trial math — pure helpers for the sidebar trial ring and badge.
// =============================================================================

export const TRIAL_LENGTH_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TrialStatus {
  daysLeft: number;
  fraction: number; // 1 = full ring, 0 = empty
  tone: "green" | "amber" | "red";
  ended: boolean;
}

export function trialStatus(trialEndsAt: Date | null, now: Date): TrialStatus | null {
  if (!trialEndsAt) return null;
  const msLeft = trialEndsAt.getTime() - now.getTime();
  if (msLeft <= 0) return { daysLeft: 0, fraction: 0, tone: "red", ended: true };
  const daysLeft = Math.ceil(msLeft / DAY_MS);
  const fraction = Math.min(1, msLeft / (TRIAL_LENGTH_DAYS * DAY_MS));
  const tone = daysLeft <= 1 ? "red" : daysLeft <= 3 ? "amber" : "green";
  return { daysLeft, fraction, tone, ended: false };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/trial.test.ts`
Expected: PASS.

- [ ] **Step 5: Plumb avatarUrl through account + upload**

1. `src/lib/validators.ts` — in `updateAccountSchema` add:

```typescript
  avatarUrl: z.string().url().max(500).optional(),
```

2. `src/app/api/account/route.ts` — GET `select` becomes:

```typescript
    select: { id: true, name: true, email: true, phone: true, avatarUrl: true, trialEndsAt: true, earlyBird: true },
```

PUT: destructure `avatarUrl` too and add to the update `data` and `select`:

```typescript
  const { name, email, phone, avatarUrl } = parsed.data;
```

```typescript
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
```

```typescript
    select: { id: true, name: true, email: true, phone: true, avatarUrl: true },
```

3. `src/app/api/upload/route.ts` line 13:

```typescript
const KINDS = new Set(["qr", "menu", "logo", "avatar"]);
```

- [ ] **Step 6: Avatar upload UI on the Account page**

In `src/app/dashboard/account/page.tsx`:

1. Add state after `phone` (~line 13): `const [avatarUrl, setAvatarUrl] = useState<string | null>(null);` and `const [uploadingAvatar, setUploadingAvatar] = useState(false);`
2. Seed it in the initial fetch: `setAvatarUrl(res.data.avatarUrl ?? null);`
3. Add the handler after `savePassword`:

```typescript
  async function uploadAvatar(file: File) {
    if (uploadingAvatar) return;
    setUploadingAvatar(true);
    setProfileMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "avatar");
      const up = await fetch("/api/upload", { method: "POST", body: form });
      const upData = await up.json();
      if (!upData.success) throw new Error(upData.error || "Upload failed");
      const save = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: upData.data.url }),
      });
      const saveData = await save.json();
      if (!saveData.success) throw new Error(saveData.error || "Save failed");
      setAvatarUrl(upData.data.url);
      setProfileMsg({ ok: true, text: "Profile photo updated." });
    } catch {
      setProfileMsg({ ok: false, text: "Could not update your photo — please try again." });
    } finally {
      setUploadingAvatar(false);
    }
  }
```

4. At the top of the Profile form (after the `<h2>Profile</h2>` line), add:

```tsx
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 overflow-hidden rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center font-black text-lg text-[var(--color-text-muted)]">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile photo" className="h-full w-full object-cover" />
            ) : (
              (name || "?").charAt(0).toUpperCase()
            )}
          </div>
          <label className="cursor-pointer rounded-xl border px-4 py-2 text-xs font-bold transition-colors hover:bg-[var(--color-bg-tertiary)]" style={{ borderColor: "var(--color-border)" }}>
            {uploadingAvatar ? "Uploading…" : "Change Photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAvatar(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/trial.ts src/lib/trial.test.ts src/lib/validators.ts src/app/api/account/route.ts src/app/api/upload/route.ts src/app/dashboard/account/page.tsx
git commit -m "feat: trial math helper and merchant avatar upload"
```

---

### Task 13: Sidebar profile block with trial ring

**Files:**
- Create: `src/components/dashboard/TrialProfile.tsx`
- Modify: `src/app/dashboard/DashboardShell.tsx`

**Interfaces:**
- Consumes: `/api/account` GET (Task 12: `name`, `avatarUrl`, `trialEndsAt`), `trialStatus` (Task 12).

- [ ] **Step 1: Create the component**

Create `src/components/dashboard/TrialProfile.tsx`:

```tsx
"use client";

// =============================================================================
// Trial Profile — sidebar avatar wrapped in a 7-day trial progress ring,
// with the merchant's name and tier badge underneath.
// =============================================================================

import { useEffect, useState } from "react";
import { trialStatus } from "@/lib/trial";

const RING_SIZE = 56;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const TONE_COLORS = {
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
} as const;

interface AccountData {
  name: string;
  avatarUrl: string | null;
  trialEndsAt: string | null;
}

export default function TrialProfile() {
  const [account, setAccount] = useState<AccountData | null>(null);

  useEffect(() => {
    fetch("/api/account")
      .then((r) => r.json())
      .then((res) => {
        if (res?.success && res.data) {
          setAccount({
            name: res.data.name ?? "",
            avatarUrl: res.data.avatarUrl ?? null,
            trialEndsAt: res.data.trialEndsAt ?? null,
          });
        }
      })
      .catch(() => {
        // sidebar block is decorative — fail silently
      });
  }, []);

  if (!account) return null;

  const trial = trialStatus(
    account.trialEndsAt ? new Date(account.trialEndsAt) : null,
    new Date()
  );
  const tone = trial ? TONE_COLORS[trial.tone] : null;
  const initial = (account.name || "?").charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-3 px-2">
      <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
        {trial && tone && (
          <svg
            width={RING_SIZE}
            height={RING_SIZE}
            className="absolute inset-0 -rotate-90"
            aria-hidden
          >
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth={RING_STROKE}
            />
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={tone}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - trial.fraction)}
            />
          </svg>
        )}
        <div
          className="absolute overflow-hidden rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center font-black text-[var(--color-text-muted)]"
          style={{ inset: RING_STROKE + 2 }}
        >
          {account.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.avatarUrl} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </div>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold" style={{ color: "var(--color-text)" }}>
          {account.name}
        </p>
        {trial && (
          <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: tone ?? "var(--color-text-muted)" }}>
            {trial.ended ? "Trial ended" : `Free Trial · ${trial.daysLeft}d left`}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount it in the sidebar footer**

In `src/app/dashboard/DashboardShell.tsx`:

1. Import: `import TrialProfile from "@/components/dashboard/TrialProfile";`
2. In the desktop footer (line 126, inside the `p-4 border-t space-y-3` div), add `<TrialProfile />` as the FIRST child (above the Theme row).

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: PASS.

Live: dashboard sidebar shows avatar/initial with a green ring and "Free Trial · 7d left" for the seeded merchant.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/TrialProfile.tsx src/app/dashboard/DashboardShell.tsx
git commit -m "feat: sidebar profile block with 7-day trial ring and tier badge"
```

---

### Task 14: Trial-mode landing pricing

**Files:**
- Modify: `src/app/page.tsx` (pricing section, lines ~415–456)
- Modify: `.env.example` if the file exists (append `NEXT_PUBLIC_TRIAL_MODE=`)

**Interfaces:**
- Consumes: env flag `NEXT_PUBLIC_TRIAL_MODE` ("true" = closed beta card).

- [ ] **Step 1: Add the flag and conditional card**

Near the top of `src/app/page.tsx` (with the other module-level constants — search for `CTA_LABEL`), add:

```typescript
const TRIAL_MODE = process.env.NEXT_PUBLIC_TRIAL_MODE === "true";
```

In the pricing section, wrap the price block (the `div.space-y-3` containing RM49/RM39, lines ~426–441) in a conditional. Replace that block with:

```tsx
                {TRIAL_MODE ? (
                  <div className="space-y-3">
                    <span className="text-4xl font-extrabold tracking-tight text-amber-950">
                      Closed beta
                    </span>
                    <p className="text-base text-amber-900">
                      Free 7-day trial · invite only, no credit card needed.
                    </p>
                    <p className="inline-flex rounded-full bg-amber-950/10 px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-amber-950">
                      First 5 merchants get RM10/month off for 6 months
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-baseline gap-3">
                      <span className="text-2xl font-bold text-amber-800 line-through">RM49</span>
                      <span className="text-6xl font-extrabold tracking-tight text-amber-950">RM39</span>
                    </div>
                    <p className="text-base text-amber-900">
                      /month · for your first 6 months
                    </p>
                    <p className="text-base text-amber-900">
                      Free 7-day trial, no credit card needed.
                    </p>
                    <p className="inline-flex rounded-full bg-amber-950/10 px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-amber-950">
                      Launch offer · 5 of 5 spots open
                    </p>
                  </div>
                )}
```

(The inclusions list and CTA button below stay unchanged for both modes.)

- [ ] **Step 2: Env plumbing**

If `.env.example` exists, append `NEXT_PUBLIC_TRIAL_MODE=true`. Add `NEXT_PUBLIC_TRIAL_MODE=true` to local `.env` for dev verification. (Railway env var is set at deploy time — note it in the final report, do not attempt to set it.)

- [ ] **Step 3: Verify**

Run: `npm run typecheck`. With the flag set in `.env`, `npm run dev` → landing pricing shows the closed-beta card with the early-bird line; with the flag unset, the RM39 card renders as before.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx .env.example
git commit -m "feat: trial-mode landing pricing behind NEXT_PUBLIC_TRIAL_MODE"
```

---

### Task 15: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — Run: `npm test`. Expected: all suites pass, including the new `eta.test.ts` and `trial.test.ts`.
- [ ] **Step 2: Typecheck + lint** — Run: `npm run typecheck && npm run lint`. Expected: clean.
- [ ] **Step 3: Production build** — Run: `npm run build`. Expected: succeeds. (This catches the Next 16 route/params pitfalls.)
- [ ] **Step 4: End-to-end walkthrough on dev server** (spec success criteria):
  1. New merchant registers → sees pending screen; admin approves → dashboard unlocks, sidebar ring shows 7d.
  2. Customer orders → merchant confirms → tracking page shows "Ready in about Xm"; menu page chip shows "~X min wait".
  3. Merchant taps +20m with reason → amber banner with reason on tracking page within ~3s; card shows "Promised in Xm" and rings red when overdue.
  4. "Delay all +10m" shifts all active cards; Clear resets.
  5. `NEXT_PUBLIC_TRIAL_MODE=true` swaps the pricing card.
- [ ] **Step 5: Diff re-read** — `git log --oneline main..HEAD` and `git diff main --stat`; re-read for stray changes.
- [ ] **Step 6: Final commit if any fixups were needed**, message `fix: <description>`.
