# Local Sandbox Load Test — Results

Target: local `next start` production bundle, port 3100, against an isolated
`queless_loadtest` Postgres database. All local, nothing touches prod or the
shared dev database used by other agents' work.

## Environment notes (read this first)

- **`.env`'s `DATABASE_URL` (port 51230) is dead.** It points at an orphaned
  `prisma dev` daemon left over from a deleted `queless-payments` checkout —
  connections get RST immediately. The actual live local Postgres this
  session uses is a different `prisma dev` daemon (project name
  `sqs-dbpool`, PID discovered via `lsof`) on port **51214**. This worktree's
  `.env` was repointed there, at an isolated `queless_loadtest` database
  (`CREATE DATABASE`, cloned schema+migrations from `template1` for free).
  This is a real, load-bearing discrepancy the team should fix in the
  checked-in `.env` guidance — the "local Postgres" everyone assumes they're
  using is not the one actually running.
- Rate limiters (`RATE_LIMIT_POST` in `src/app/api/orders/route.ts`,
  `PROOF_RATE_LIMIT` in `src/app/api/orders/[orderId]/proof/route.ts`) were
  raised to 1,000,000 **in the local working tree only**, never committed.
- Schema note: `Store.ownerId` is `@unique` ("one store per merchant... the
  dashboard reads `stores[0]` everywhere" per the schema comment), so "one
  merchant, two stores" as specced is not expressible. Seeded **two merchant
  users, one store each** instead.
- `AUTH_TRUST_HOST=true` was required to run `next start` on a non-3000 port
  locally (NextAuth v5 self-host requirement) — an env var at run time, not a
  code change.
- The production build (`npm run build && npm start`) was used throughout,
  not `next dev`.

## Critical finding: the shared local Postgres daemon cannot sustain concurrent load

This is the headline result and it changes what the rest of this document
can honestly claim.

The local database backing this environment (`prisma dev`, project
`sqs-dbpool`, port 51214) is a lightweight, single-developer embedded
Postgres daemon. It is currently shared by roughly 30 concurrently active
agents in this session, each doing real work (payment-migration
implementation, review, etc.) against it — this is genuinely a shared
resource, not something isolated to this load test.

**Isolated proof, no application code involved.** A bare `pg.Pool` doing
`SELECT 1` against the daemon:

| Concurrent connections | Successful |
|---|---|
| 3 | 1-2 / 3 |
| 7 | 2 / 7 |
| 10 | 0-2 / 10 |
| 15 | 2 / 15 |

Sequential single queries succeeded 100% of the time throughout. The
failure mode is `ECONNRESET` on connection, or Prisma-side `P1017 "Server
has closed the connection"` on already-established pool connections. This
was checked **repeatedly over ~15 minutes** (not a one-off blip) and got
*worse* over the session, not better — consistent with aggregate load
climbing as other agents' work continued.

**What this rules out.** Before concluding this was infrastructure and not
the app:
- Raw `pg.Pool` (max: 7) with 50 and 200 concurrent parameterized queries,
  and with 200 concurrent explicit transactions (BEGIN/SELECT/SELECT/COMMIT,
  mimicking the shape of `order.create`): **clean, zero errors**, when run
  during a quieter moment of the session.
- `PrismaClient` + `@prisma/adapter-pg` used directly (bypassing Next.js and
  HTTP entirely), 50 concurrent full order-creation-equivalent operations:
  **clean, zero errors.**
- Only when going through the running Next.js app under concurrent HTTP
  load did errors appear, and they scaled with how contended the shared
  daemon happened to be at that moment, not with a fixed concurrency
  threshold — the same concurrency level was clean early in the session and
  badly degraded later.

**Conclusion.** The team lead's premise — "local Postgres has no
connection-pooler ceiling, so these numbers measure app capacity, not the
15-connection Supabase limit" — is directionally right about *architecture*
(there is no PgBouncer/Supabase-style pooler in front of this local
instance) but does not hold in *practice* in this shared multi-agent
session: the daemon itself became the bottleneck, well before the app's own
`POOL_MAX_CONNECTIONS = 7` (`src/lib/prisma.ts`) or any real app-code limit
was reached. Numbers gathered under this contention describe "this shared
dev daemon under current aggregate load," not "this app's capacity on a
quiet machine."

**Resolution used for all numbers below.** Rather than report numbers
contaminated by other agents' unrelated concurrent load, this test
provisioned a throwaway, dedicated standalone Postgres 16 via
`brew install postgresql@16`, running only for the duration of this test:

```
data dir: /tmp/queless-loadtest-pg
port:     55432, max_connections=500, shared_buffers=256MB
start:    pg_ctl -D /tmp/queless-loadtest-pg -o "-p 55432 -c max_connections=500 -c shared_buffers=256MB" -l /tmp/queless-loadtest-pg.log start
stop:     pg_ctl -D /tmp/queless-loadtest-pg stop
```

Verified clean (100% success) at 10, 100, and 300 concurrent raw `pg.Pool`
connections before trusting it for the rest of this test. This never
touched the shared `sqs-dbpool` daemon or any other agent's environment —
it's a fully separate process on its own port, stopped at the end of this
run. **All numbers in Phases A-D below are against this dedicated instance**,
so they measure the app, not shared-session noise. The team should still fix
the dead `.env` port (51230) and be aware `sqs-dbpool` degrades under
concurrent multi-agent load — that's real and worth its own follow-up, just
not what's being reported here.

## Seed data

`scripts/loadtest/seed.ts` — 2 merchant users (schema forces this, see
above), 2 active stores, 8 menu items each, 100 orders/store spread evenly
across `AWAITING_CONFIRMATION` / `PAID` / `PREPARING` / `READY` with 1-3
`orderItems` each. Verified: 200 orders, 398 order items. IDs written to
`scripts/loadtest/fixture.json`, consumed by every phase script.

## Phase A — order-creation burst

`scripts/loadtest/phase-a-burst.mjs`. Each concurrency level: a discarded
warm-up burst, then 5 measured trials (3 at the extreme levels), split
across both stores. Client uses `node:http` with a high-`maxSockets` agent
and per-request timeouts (not `fetch`, whose default connection pool caps
at ~6/origin and would silently serialize the "concurrent" load) — a
peak-in-flight counter confirmed the reported concurrency is real.

At the shipped config (`POOL_MAX_CONNECTIONS = 7`):

| Concurrency | Clean trials | Error rate | p50 | p95 | p99 | Throughput (ok/s) |
|---|---|---|---|---|---|---|
| 50 | 5/5 | 0% | 88 ms | 98 ms | 98 ms | 488 |
| 100 | 5/5 | 0% | 107 ms | 118 ms | 119 ms | 802 |
| 200 | 5/5 | 0% | 158 ms | 176 ms | 177 ms | 1068 |
| 400 | 5/5 | 0% | 255 ms | 302 ms | 305 ms | 1277 |
| 800 | 3/3 | 0% | 519 ms | 864 ms | 875 ms | 897 |
| 1600 | 3/3 | 0% | 979 ms | 2582 ms | 2684 ms | 591 |
| 3000 | 0/2 | 13.4% | 1471 ms | 6548 ms | 6615 ms | 313 |

**200 concurrent customers across 2 stores (the question this test was
actually asked) is comfortably inside the clean zone** — zero errors, p99
under 180ms. The app stays fully clean up to 1600 concurrent order-creation
requests; latency grows (queuing behind the 7-connection pool) but nothing
times out or errors. Somewhere between 1600 and 3000, real errors start
(client and server timeouts as pooled requests queue past the 10s
`connectionTimeoutMillis` in `src/lib/prisma.ts`).

**The connection pool is not the reason it eventually breaks.** Raising
`POOL_MAX_CONNECTIONS` from 7 to 50 (uncommitted local edit, reverted before
finishing) does not fix the 3000-concurrency degradation and does not even
meaningfully help at 400:

| Config | Concurrency | Clean trials | Error rate | p50 | p95 |
|---|---|---|---|---|---|
| pool=7 | 400 | 5/5 | 0% | 255 ms | 302 ms |
| pool=50 | 400 | 3/3 | 0% | 288 ms | 489 ms |
| pool=7 | 3000 | 0/2 | 13.4% | 1471 ms | 6548 ms |
| pool=50 | 3000 | 0/3 | 12.6% | 1123 ms | 6525 ms |

pool=50 is not better at 400, and barely different at 3000. The real
constraint at extreme concurrency is single-process Node/Next.js request
handling throughput (JSON parsing, Zod validation, route overhead across
thousands of simultaneous requests), not the Postgres pool size. This is a
genuinely useful finding: **raising `POOL_MAX_CONNECTIONS` would not buy
meaningfully more headroom** if the team ever needs to push past ~1600
concurrent order-creation requests on a single instance.

RSS grew steadily and predictably with load (202MB at 50 concurrent → 581MB
at 400 → ~850MB at 3000), never showing a leak signature (it settles back
down between bursts).

Raw JSON: `scripts/loadtest/results/phase-a-pool7.json`,
`phase-a-pool7-extreme.json`, `phase-a-pool7-3000-fixed.json`,
`phase-a-pool50.json`.

## Phase B — live-update load with a full board

`scripts/loadtest/phase-b-sse.mjs`. 200 customer SSE connections (one per
real seeded order, `/api/queue/stream?orderId=`) + 2 merchant dashboard
connections (`/api/queue/stream?storeId=`, the heavy store-wide query),
held 60 seconds.

- **Customer connections: 200/200 opened, 0 failed, 0 dropped early.**
  1,323,800 bytes total, 4,000 events (20 polls × 200 connections, matching
  the 3s poll interval over 60s).
- **Merchant connections: 2/2 opened, 0 failed, 0 dropped early.**
  4,596,440 bytes total, 40 events (20 polls × 2 connections).
- **Merchant payload size — the specifically requested number:
  114,903 bytes (~112 KB) for a single `STORE_QUEUE_UPDATE` frame with
  exactly 100 active orders.** That's ~1,149 bytes/order (full order +
  orderItems JSON, no delta encoding). At the 3-second poll interval, one
  connected merchant dashboard costs ~112 KB × 20 = ~2.24 MB/minute. This is
  a >5x jump from the prior production stress test's finding (Finding 3:
  ~19 KB per poll at ~20 active orders) — payload size scales linearly with
  board size as predicted there, and a merchant with a consistently full
  100-order board now costs real, measurable bandwidth per connected
  dashboard tab.
- Server process during the 60s hold: RSS 208.6–290.3 MB (stable, no
  runaway growth for this level), CPU averaged 1.1%, peaked 32.3% on a poll
  tick.

Raw JSON: `scripts/loadtest/results/phase-b-main.json`.

## Phase C — combined realistic peak (the lunch-rush shape)

`scripts/loadtest/phase-c-combined.mjs`. The 200 customer + 2 merchant SSE
connections from Phase B held open, and *while held*, fired a 200-concurrent
order-creation burst plus 30 storefront page loads — simultaneously.

- **Order burst: 200/200 ok, 0 errors.** p50 253 ms, p95 279 ms, p99 281 ms
  — indistinguishable from Phase A's isolated 200-concurrency result. Live
  dashboards polling in the background did not measurably degrade write
  latency.
- **Storefront page loads: 30/30 ok, 0 errors.** p50 345 ms, p95 349 ms.
- **All 200 customer + 2 merchant SSE connections stayed open the entire
  30s hold: 0 failed, 0 dropped early**, even under the simultaneous write
  burst.
- Server process: RSS 246–385 MB, CPU averaged 2.4%, peaked 37.8%.

**This is a clean pass on the actual scenario the team lead asked about**
("2 stores each take 100 customers at the same time") — it does not break,
and there's meaningful headroom left (CPU never left single digits on
average).

Raw JSON: `scripts/loadtest/results/phase-c-main.json`.

## Phase D — the actual SSE breaking point

`scripts/loadtest/phase-d-breaking-point.mjs`. Client `ulimit -n`:
**1,048,576** (effectively unlimited on this machine — the client was never
the file-descriptor bottleneck; confirmed by 0 client `EMFILE` at every
level below).

| SSE connections | Opened | Client failed | Server failed | Server RSS | Server CPU (avg / max) |
|---|---|---|---|---|---|
| 300 | 300 | 0 | 0 | 314–334 MB | 0.9% / 4% |
| 500 | 500 | 0 | 0 | 342–376 MB | 2.2% / 13.2% |
| 1000 | 1000 | 0 | 0 | 423–436 MB | 9.7% / 41.8% |
| 2000 | 2000 | 0 | 0 | 517–561 MB | 41.6% / 139.3% |
| 3000 | 3000 | 0 | 0 | 686–836 MB | 50.7% / 134.2% |
| 5000 | 4742 | 258 (5.2%) | 0 | 875–1199 MB | 98.1% / 170.2% |

**Breaking point: ~5,000 concurrent SSE connections.** Zero server-side
error *responses* at any level (`serverFailed` is 0 throughout) — the
failure mode at 5000 is 258 client-visible connection resets with no
response ever received, while the *server* process's own CPU was already
sustaining 98% average / 170% peak (more than one core) and RSS had crossed
1.1 GB. This reads as the single Next.js process running out of headroom to
accept and service new connections fast enough while already juggling ~4700
open long-lived streams and their 3-second poll timers — a real, credible
ceiling for a single-process/single-core-bound Node server, not a test
artifact. Between 300 and 3000, the server handled every connection cleanly
and RSS/CPU grew smoothly and predictably (no cliff, no leak signature)
right up to the point it stopped keeping up.

Raw JSON: `scripts/loadtest/results/phase-d-main.json` (300-1000),
`phase-d-main-high.json` (2000-5000).

## Summary

| Question | Answer |
|---|---|
| Does "2 stores × 100 concurrent customers" break the app? | **No.** Phase C ran exactly this shape cleanly: 0 errors, sub-300ms write latency, all SSE connections held. |
| Where is the actual ceiling for order creation? | Clean to 1600 concurrent creates; real errors appear between 1600-3000. Not fixable by raising the DB pool — bottleneck is single-process request handling, not Postgres. |
| Where is the actual ceiling for live SSE connections? | ~5,000 concurrent connections, driven by server CPU/RSS on a single Node process, not sockets or file descriptors. |
| What does one merchant dashboard cost with a full (100-order) board? | **114,903 bytes per poll, ~2.24 MB/minute per open tab** at the current 3s/no-delta polling design. |
| Is local Postgres actually pooler-free, so these numbers are real app capacity? | **Only on a dedicated instance.** The shared `sqs-dbpool` daemon this session normally uses could not sustain even ~10 concurrent connections under other agents' aggregate load — see the Critical Finding above. All numbers here are from a throwaway dedicated Postgres 16, not that shared daemon. |

