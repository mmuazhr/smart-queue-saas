# Stress Test — Production, 2026-08-01

Target: `https://queless-production.up.railway.app` (Railway Hobby, Singapore,
single replica) against Supabase Postgres (ap-southeast-1). Run pre-pilot, with
no real merchants on the platform. All load-test orders were cancelled
afterwards; the board was verified clean.

Harness: `stress.mjs` (scratchpad), plain `fetch` from one client in Malaysia,
so numbers include real internet RTT.

## Headline

One **critical** finding (fixed in a follow-up branch), otherwise the platform
behaved correctly under every concurrency and correctness probe. No data
corruption, no duplicate queue numbers, no 5xx outside the connection-pool
issue below.

## Finding 1 — CRITICAL: DB connection-pool exhaustion during deploys

**Symptom.** 30 concurrent GETs of a DB-backed storefront page, run
immediately after a deploy: **60 of 180 requests returned HTTP 500 (33%)**.
The same load minutes later: 0 errors.

**Root cause.** Railway logs:

```
PostgresError { code: "XX000",
  message: "(EMAXCONNSESSION) max clients reached in session mode
            - max clients are limited to pool_size: 15" }
  on prisma.store.findUnique()
```

Prod `DATABASE_URL` uses the Supabase **session-mode** pooler (port 5432),
which caps the project at 15 client connections. `src/lib/prisma.ts` created
`new PrismaPg({ connectionString })` with no explicit bounds (node-postgres
defaults to max 10 per pool) and — critically — never cached the client on
`globalThis` in production, so more than one pool could exist per container.
During a deploy the outgoing container still holds its connections while the
incoming one opens its own, breaching the 15-client ceiling. Every affected
request hard-fails rather than queuing.

**Why it matters for the pilot.** Every deploy creates a window where real
customers see errors mid-order. It also caps headroom permanently and would
break immediately if a second replica were ever added.

**Fix.** Bound the pool explicitly (max ~6-8, connection + idle timeouts so a
saturated pool queues instead of opening sockets) and share one client across
bundles via `globalThis` in all environments. Dispatched as branch `db-pool`.
Deliberately NOT switching to the transaction-mode pooler (6543) in the same
change — that is an infrastructure decision to evaluate separately.

## Finding 2 — MEDIUM: `getClientIp` trusts the first `x-forwarded-for` entry

`src/lib/rate-limit.ts` returns `forwarded.split(",")[0]`, which is
client-controlled in the general case. **However, the attack did not land in
practice**: 40 concurrent order POSTs with 40 distinct spoofed
`x-forwarded-for` values still shared a single rate-limit bucket (10 × 201,
30 × 429), so Railway's proxy is normalizing the header before it reaches the
app. Treat this as defence-in-depth to fix during the security audit, not an
open hole today — but do not rely on an infrastructure behaviour that is not
contractual.

## Finding 3 — LOW: SSE payload size scales with active orders

25 concurrent SSE connections streamed **1.9 MB in 12 seconds** (~76 KB per
connection, ~19 KB per 3-second poll) with ~20 active orders on the board.
Payload is the full order list per tick, so bandwidth grows linearly with
active orders and connected dashboards. Fine at pilot scale; revisit (delta
updates, or trimming the payload) before a merchant runs a large board.

## Results by phase

| Phase | Load | Result |
|---|---|---|
| Rate limiter | 30 rapid order POSTs, one IP | ✅ exactly 10 × 201 then 20 × 429 — limit enforced precisely |
| Read path, health | 180 requests @ 30 concurrent | ✅ 100% 200, p50 216 ms, p95 263 ms |
| Read path, storefront | 180 requests @ 30 concurrent (post-deploy) | ❌ 33% 500 — Finding 1 |
| Concurrency ramp | 4 → 60 concurrent, storefront | ✅ 0 errors at every level once connections settled; p50 135 ms @4 → 879 ms @60 (healthy queuing) |
| Write concurrency | 40 concurrent order POSTs | ✅ no 5xx; rate limiter shed the excess |
| **CAS correctness** | 4 simultaneous confirms × 10 orders | ✅ **exactly one 200 per order**, rest 422; no duplicate queue numbers, no 5xx |
| SSE fan-out | 25 concurrent streams, held 12 s | ✅ all opened, none dropped; health still 78 ms under load |
| Soak | 60 s @ 5 rps | ✅ 270/270 × 200, p50 113 ms, p95 187 ms, no drift |

## What this says about pilot capacity

With the pool fix in place, the single replica comfortably serves the pilot:
sustained traffic is flat and fast, and 60 concurrent page loads degrade
gracefully (slower, not failing). The binding constraint is the 15-connection
Supabase ceiling, not CPU or memory. The order-creation rate limit (10/min per
IP) is well above real customer behaviour but would throttle a merchant demoing
from one phone on a shared network — worth remembering during onboarding.

## Not covered (deliberate)

- Proof-upload concurrency at scale (would push test objects into the private
  bucket; the 48-hour retention sweep would clear them, but the storage-side
  load is better measured after the pool fix).
- Multi-store contention — prod has one store today.
- Sustained multi-hour soak; the 60-second run is a smoke check for drift.
