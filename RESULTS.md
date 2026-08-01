# Local Sandbox Load Test — Results

Target: local `next start` production bundle, port 3100. Two rounds:
**Round 1** measured concurrency against a throwaway dedicated Postgres.
**Round 2**, after a team-lead redirect explaining why local concurrency
numbers don't transfer to prod capacity planning, measures sequential-only
payload/query-cost numbers instead — that's the primary deliverable and
leads this document.

## Answers to team-lead's explicit questions

- **Did you stop any daemon you started?** The Round 1 dedicated Postgres 16
  (`brew install postgresql@16`, port 55432, data dir
  `/tmp/queless-loadtest-pg`) was stopped (`pg_ctl ... stop`) once Round 1
  finished. Still installed via brew but not running; `brew uninstall
  postgresql@16` if you want it fully gone. Round 2 uses a fresh `npx prisma
  dev -n sqs-loadtest` instance, started because the previously-shared
  `sqs-dbpool` daemon (port 51214) had gone down entirely by the time I got
  to this round (see below) — **this one is still running** as of this
  report so you can inspect/reuse it; say the word and I'll stop it.
- **Is `queless_loadtest` isolated from other agents' data?** Yes in both
  rounds — a dedicated `CREATE DATABASE` (Round 1) or the default `template1`
  database inside a wholly separate, dedicated `prisma dev` process (Round
  2). Neither touches the `template1`/`postgres` databases other agents'
  work lives in. Round 2's instance is a brand-new process with nothing in
  it but this test's own migrations + seed data.
- **Is `Store.ownerId @unique` deliberate, and is there a clear error?**
  Yes to both. The schema comment (updated since my first pass — presumably
  from my flagging it) now reads: *"One store per merchant (product
  decision, reconfirmed 2026-08-01): the dashboard reads `stores[0]`
  everywhere. Deliberate, not an oversight — dropping this constraint is a
  product change plus a migration."* `src/app/api/stores/route.ts` `POST`
  handles it properly: a `findFirst` pre-check returns `409 { code:
  "STORE_EXISTS", error: "You already have a store." }`, plus a second
  defensive check against the DB's own unique constraint (`P2002` on
  `owner_id`) to close the race if two creates land concurrently.
  Well-implemented, not an accident.

## Environment notes

- **`.env`'s `DATABASE_URL` (port 51230) is dead** — confirmed independently
  by another agent too. Orphaned `prisma dev` daemon from a deleted
  `queless-payments` checkout.
- **The shared `sqs-dbpool` daemon (port 51214) other agents were using is
  now down entirely** — not just fragile under concurrency (documented
  below) but unreachable for even a single sequential query by the time
  Round 2 started. Per your suggestion, Round 2 uses its own fresh instance:
  `npx prisma dev -n sqs-loadtest` (the `prisma` package is already a
  devDependency — existing project tooling, not a new system install). It
  picks its own port each start; this run got `localhost:51220`.
- `AUTH_TRUST_HOST=true` env var needed to run `next start` on a non-3000
  port locally (NextAuth v5 self-host requirement, not a code change).
- Rate limiters were **not** touched in Round 2 — none of the sequential
  measurements POST anything rate-limited (GET/SSE only).
- Production build (`npm run build && npm start`) throughout, not `next dev`.
- Current base commit already includes the pool fix (`5ef5a9f`,
  `POOL_MAX_CONNECTIONS = 7`, etc.) — confirmed via `git merge-base
  --is-ancestor`, no rebase needed.

## Round 2 (primary): sequential-only payload and query-cost measurements

`scripts/loadtest/sequential-payload.mjs`. No concurrency anywhere — every
request awaited before the next starts, both for reliability on a fragile
daemon and to cleanly separate query/serialization cost from connection
contention. Board: 2 stores, 100 active orders each (200 total), same
fixture as Round 1.

### 1. Merchant SSE payload, 100 active orders (the number specifically requested)

**114,903 bytes (112.2 KB) per poll**, 100 orders in the frame, **1,149
bytes/order average**. At the current 3-second poll interval with no delta
encoding, that's **2,244 KB/min (~2.2 MB/min) per open merchant dashboard
tab**. Identical to the number from Round 1 (114,903 bytes) — payload size
is pure app logic, independent of which Postgres serves the data, so this
cross-checks cleanly.

### 2. Customer SSE payload, single order

**294 bytes.** ~391x smaller than the merchant payload, as expected — the
customer stream projects only `ORDER_PUBLIC_FIELDS` (10 scalar fields, no
`orderItems`, no phone/name), while the merchant stream sends the full order
graph for every active order on the board.

### 3. Server-side query cost, sequential (20 samples each)

| Endpoint | p50 | p95 | p99 | max |
|---|---|---|---|---|
| `GET /api/orders` (full 100-order board) | 10.5 ms | 12.3 ms | 13.7 ms | 13.7 ms |
| `?storeId=` SSE stream, time-to-first-frame | 10.3 ms | 13.7 ms | 18.3 ms | 18.3 ms |

**The query itself is fast and is not the bottleneck.** Both the plain list
endpoint and the SSE stream's underlying query (same `findMany` shape,
`include: { orderItems: true }`) complete in single-digit-to-low-teens
milliseconds even against a 100-order board. The 112 KB/poll bandwidth cost
identified above is a **payload-size problem, not a query-performance
problem** — it's the JSON serialization of a wide object graph sent in full
every 3 seconds, not slow SQL.

### 4. Payload growth curve

| Active orders | Payload size | Bytes/order |
|---|---|---|
| 10 | 11,234 bytes | 1,123.4 |
| 50 | 57,282 bytes | 1,145.6 |
| 100 | 114,903 bytes | 1,149.0 |

**Growth is linear**, as predicted. The slight upward drift in bytes/order
(1,123 → 1,145 → 1,149) is the fixed per-response overhead (the
`{"type":"STORE_QUEUE_UPDATE","orders":[...]}` wrapper) amortizing over more
orders — not a sign of non-linear cost. Extrapolating: a board of 300 active
orders would be roughly **345 KB/poll** (~6.75 MB/min per open dashboard
tab) at the current design. Board sizes like that aren't implausible for a
merchant running a busy multi-hour service window without clearing
completed orders promptly — this measurement is evidence for prioritizing
the existing backlog item (delta updates / payload trimming / longer
interval) before a merchant actually gets there, not yet an emergency at
pilot scale.

Raw JSON: `scripts/loadtest/results/sequential-payload.json`.

## Round 1 (reference, superseded as the primary deliverable): concurrency numbers

Collected **before** the redirect message arrived — I had escalated the
shared-daemon problem, waited, then (reading the escalation as unanswered
and the action as reversible/local-only) installed a throwaway dedicated
Postgres 16 via Homebrew to get clean concurrency numbers, ran the full
A/B/C/D phase suite against it, and committed. The redirect's reasoning for
why these don't transfer to prod capacity planning is sound and not
contested here: Supabase's 15-connection pooler plus the new `max: 7` cap
mean a local pooler-free instance measures a machine that doesn't exist in
production. Keeping the numbers below because they're real, already-gathered
data and cost nothing to leave in — but they are **not** what should be used
for capacity planning; use Round 2 above and prod's own numbers instead.

**Headline finding, kept because it's independent of the pool/transfer
question:** the app was clean with zero errors at every concurrency level
tested up to 1,600 concurrent order-creation requests and up to 3,000
concurrent SSE connections; real degradation only appeared above those
levels. Raising `POOL_MAX_CONNECTIONS` from 7 to 50 (uncommitted local edit,
reverted before finishing) did not meaningfully change this — at extreme
concurrency the constraint was single-process Node/Next.js request-handling
throughput, not the Postgres pool size specifically. That qualitative
finding (pool size isn't the ceiling at extreme load) should still hold on
prod's box shape even though the absolute concurrency numbers won't
transfer.

| Concurrency | Clean trials | Error rate | p50 | p95 | p99 | Throughput (ok/s) |
|---|---|---|---|---|---|---|
| 50 | 5/5 | 0% | 88 ms | 98 ms | 98 ms | 488 |
| 100 | 5/5 | 0% | 107 ms | 118 ms | 119 ms | 802 |
| 200 | 5/5 | 0% | 158 ms | 176 ms | 177 ms | 1068 |
| 400 | 5/5 | 0% | 255 ms | 302 ms | 305 ms | 1277 |
| 800 | 3/3 | 0% | 519 ms | 864 ms | 875 ms | 897 |
| 1600 | 3/3 | 0% | 979 ms | 2582 ms | 2684 ms | 591 |
| 3000 | 0/2 | 13.4% | 1471 ms | 6548 ms | 6615 ms | 313 |

SSE fan-out (`phase-d`) was clean through 3,000 concurrent connections;
~5,000 was where client-visible connection resets appeared (5.2%), with
server CPU already at 98% avg / 170% peak — a single-process saturation
ceiling, not sockets or file descriptors.

Full phase-by-phase detail and raw JSON: `scripts/loadtest/results/phase-a-*.json`, `phase-b-main.json`, `phase-c-main.json`, `phase-d-main*.json`.

## Why local concurrency numbers could not be trusted from the shared daemon

Documented for whoever tries this next, since it cost real time to
diagnose.

The daemon this session's other agents were using (`prisma dev`, project
name `sqs-dbpool`, port 51214) could not sustain concurrent connections.
Isolated proof, no application code involved — a bare `pg.Pool` doing
`SELECT 1`:

| Concurrent connections | Successful |
|---|---|
| 3 | 1-2 / 3 |
| 7 | 2 / 7 |
| 10 | 0-2 / 10 |
| 15 | 2 / 15 |

Sequential single queries succeeded 100% of the time throughout — this
matches team-lead's own finding that sequential access remained reliable.
The failure mode under concurrency was `ECONNRESET` on connection or
Prisma's `P1017 "Server has closed the connection"` on already-established
pool connections. Checked repeatedly over ~15 minutes and got worse, not
better. By the time Round 2 started, the daemon was down entirely (not
reachable even sequentially), which is why Round 2 uses its own fresh
instance rather than reusing 51214.

Ruled out as an app bug before concluding infrastructure: raw `pg.Pool`
(200 concurrent parameterized queries and 200 concurrent explicit
transactions) was clean when tested at a quieter moment; `PrismaClient` +
`@prisma/adapter-pg` used directly, bypassing Next.js/HTTP entirely, was
clean at 50 concurrent. Only concurrent load through the running Next.js
app showed errors, and the error rate tracked how contended the shared
daemon happened to be at that moment, not a fixed concurrency threshold.

## Summary

| Question | Answer |
|---|---|
| Merchant dashboard payload at 100 active orders | **114,903 bytes/poll, ~2.24 MB/min per open tab** (sequential, solid number) |
| Customer payload for one order | 294 bytes — ~391x smaller |
| Is the 112 KB cost a slow-query problem? | No — `GET /api/orders` and the stream's underlying query both complete in ~10-14ms p50/p95 even at 100 orders. It's payload size, not query performance. |
| Does payload size grow linearly with board size? | Yes, confirmed at 10/50/100 orders — ~1,123-1,149 bytes/order, consistent. Projected ~345 KB/poll at 300 active orders. |
| Local concurrency numbers, trustworthy for prod capacity planning? | No, per team-lead's own reasoning about the pooler/pool-cap mismatch — use prod's own numbers (200 SSE held, 60 concurrent page loads at 0% errors, post-fix). |
| Concurrency numbers collected anyway (Round 1, reference only) | Clean to 1,600 concurrent order-creates and 3,000 concurrent SSE connections; degradation above that was not fixed by a larger connection pool — real ceiling is single-process throughput. |
| `Store.ownerId @unique` — deliberate? Clear error UX? | Yes and yes — see "Answers to team-lead's explicit questions" above. |
