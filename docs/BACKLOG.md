# QueLess Backlog

Single source of truth for pending work. Items graduate to a spec in
`docs/superpowers/specs/` before implementation. Added 2026-08-01.

## Now — before/early pilot

- [ ] **Stress test** (owner request 2026-08-01). Load-test pilot readiness against a
  staging-like target: order POST bursts (rate-limiter behavior + 429 correctness),
  concurrent merchant transitions on the same order (CAS 409s, not 500s), many parallel
  SSE dashboard/customer connections on the single replica, proof-upload concurrency,
  and sustained soak. Explicitly probe the pgbouncer 08P01 prepared-statement failure
  under concurrent writes (see T-A below — expected to reproduce until fixed).
- [ ] **Security hardening audit** (owner request 2026-08-01). Goal: nobody can reverse
  the client or probe the API into backend access. Scope: every `/api` route's authz
  boundary re-checked (merchant-owns-store, admin-only, public surface minimal);
  client-bundle sweep for leaked env vars/secrets (only `NEXT_PUBLIC_*` may appear);
  password hashing + NextAuth session/cookie settings review; Supabase bucket policies
  (payment-proofs must stay private; service key server-only); security headers
  (CSP, nosniff, frame-ancestors); dependency audit (`npm audit`); rate limits on all
  public endpoints; error responses never leak internals (stack traces, storage keys,
  SQL). Includes the already-ledgered items: spoofable `x-forwarded-for` in the rate
  limiter (needs trusted-proxy validation on Railway), stale `/api/webhooks` prefix in
  middleware PUBLIC_PATHS, `paymentQrUrl` accepts any URL (validate origin against the
  Supabase public bucket), `X-Content-Type-Options: nosniff` on the streamed proof GET.
- [ ] **T-A: pgbouncer 08P01 fix** — `src/lib/prisma.ts` uses `new PrismaPg({connectionString})`
  with no explicit pool; concurrent writes intermittently fail with prepared-statement
  errors against the Supabase pooler. Fix with an explicit `pg.Pool` (or pooler-safe
  config). Recommended before pilot traffic.
- [ ] **External uptime monitor** on `/api/health` — Railway restart policy is
  ON_FAILURE max 5 retries, after which the service can go dark silently.
- [ ] **Pilot merchant onboarding** — prod has no store yet; create/onboard the pilot
  merchants (register → store → DuitNow QR upload → charges config) and delete
  leftover QA/test accounts and stores (T-E data hygiene, incl. legacy
  PENDING_PAYMENT rows that have no valid transitions, and stale test rows on
  abang-burger).

## Next

- [ ] **T-B: queue-number DB constraint** — plain `@@unique([storeId, queueNumber])`
  would break on day 2 (counters reset at MY midnight); needs a `queueDate` column in
  the key or a partial index.
- [ ] **T-D: estimatedWaitMins** is never written (`calculateETA` has zero callers) —
  customers always see a 0-minute wait; compute at confirm.
- [ ] **Idempotent re-confirm** — a lost ack followed by a merchant retry currently
  hits 422; make confirm idempotent when the order is already PAID with a queue number.
- [ ] **Password reset flow** — blocked on email-provider choice (Resend suggested).
- [ ] **Storage cleanup, public-assets** — orphaned test QR object
  `qr/2e4d342a-.../775100ff-....png` in the public bucket (payment-proof test objects
  age out automatically via the 48h retention sweep; public assets have no sweep).
- [ ] **Duplicate charge labels** — `storeChargesSchema` allows two charges with the
  same label; add a uniqueness `.refine` (also fixes `key={line.label}` nit at three
  render sites).
- [ ] **Proof PATCH final write** — add `status: "AWAITING_CONFIRMATION"` to the CAS
  `updateMany` so a proof can't land on a just-cancelled order (harmless today).

## Later

- [ ] **Payment gateways** (parked by product decision 2026-08-01) — revisit once the
  QR-proof pilot proves the flow; see docs/BUSINESS_MODEL.md.
- [ ] **middleware.ts → proxy.ts / nodejs runtime** revisit now the Cloudflare
  constraint is gone (would also retire sentry.edge.config.ts).
- [ ] **Route-level test coverage** — repo convention is lib-only vitest; the confirm
  CAS and proof PATCH are the highest-value routes if route testing gets added.
- [ ] **Cart button bounce animation** — design linter flags the `animate-bounce-in`
  entrance (StoreMenuClient); owner to decide keep vs ease-out swap.
- [ ] **Legacy receipt gap** — pre-feature completed orders show Subtotal→Total with
  the old baked-in 6% tax unexplained; vestigial `order.tax` in the client interface.
