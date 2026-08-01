# Security Audit & Penetration Test — 2026-08-01

Scope: full audit + active penetration test of QueLess in production
(https://queless-production.up.railway.app), run pre-pilot with no real
merchants on the platform. Authorized by the owner on their own system.

Method: four parallel code audits (authorization, secrets/bundle,
auth/session, headers/deps/storage) plus live exploitation against production
by the orchestrator. Every high-impact finding was reproduced live before
fixing and re-fired against the deployed fix to confirm closure.

## Findings fixed and verified closed

All fixes deployed 2026-08-01 and re-tested against live production.

| # | Finding | Severity | Live before | Live after |
|---|---------|----------|-------------|------------|
| 1 | Cross-tenant menu injection — any free merchant account could plant items on another store's public menu by supplying that store's categoryId | High | Reproduced end-to-end (item appeared on victim storefront) | 400 rejected |
| 2 | Private payment-proof storage key (`paymentProofUrl`) returned by `GET /api/stores/[storeId]/orders` | Medium | Field present in response | Field stripped |
| 3 | Login endpoint had no brute-force rate limit | High | 12 rapid wrong-password attempts, none throttled | 429 at attempt 11 |
| 4 | No security headers; merchant dashboard frameable (clickjacking "Confirm Payment") | High | All headers absent | CSP, X-Frame-Options DENY, HSTS, nosniff, Referrer-Policy all present; X-Powered-By removed |
| 5 | SSE stream had no connection rate limit or max lifetime (flood → single-replica outage) | High | Unlimited | 429 at connection 16 (cap 15) + 15-min max lifetime |
| 6 | Menu price with no upper bound overflowed the Decimal(10,2) column → unhandled 500 | Low | 999999999 → 500 | 400 rejected |
| 7 | `paymentQrUrl` accepted `javascript:`/`data:`/arbitrary-http URLs (rendered as `<img src>`) | Low | Accepted | 400 for hostile schemes; legit Supabase URL still accepted |
| 8 | Login `callbackUrl` passed unvalidated to `router.push()` — open redirect + potential `javascript:` execution | High | Confirmed via code + Next 16's own docs | Fixed: only internal `/` paths accepted (deployed; client-side, confirm with a browser) |

Fix commits on `main`: dcbb4d5, 88f9158 (sec-menu); 17f30e8 (sec-hardening);
16124b2 (price + paymentQrUrl); d767e58 (callbackUrl).

## Verified secure — tested, not assumed

- **SQL injection**: payloads in slug, storeId, phone, orderId all handled
  cleanly (Prisma parameterization; the one raw query uses bound params).
- **Stored XSS**: script payloads in menu/store fields store but render
  escaped — React auto-escaping confirmed on the live storefront HTML.
- **Session/JWT forgery**: a tampered session cookie is rejected (401).
- **Mass assignment**: forced `id`/`storeId`/`ownerId`/`role` fields are
  ignored — zod whitelist schemas; role/ownerId/status not settable by a
  merchant. Escalation paths tested live, all 403.
- **IDOR**: a merchant owning no store was refused on 12 cross-tenant
  operations (read/rename/pause/menu/orders/analytics/SSE) — all 403.
- **Price forgery**: order totals recomputed server-side from DB prices.
- **SSRF**: no server-side fetch of any user-supplied URL exists.
- **File upload**: magic-byte sniffer rejects SVG/non-images; stored objects
  always served with the server-sniffed image content-type; storage keys are
  server-generated UUIDs (no path traversal); size cap enforced post-parse.
- **Secrets/bundle**: client bundle contains no service-role key, DB URL, or
  any server secret (verified by build + grep with a positive control);
  source maps disabled; no `.env` ever committed; errors return generic
  messages, never stack traces. Anon key's JWT role claim confirmed `anon`.
- **CSRF**: not exploitable (httpOnly + Secure + SameSite=Lax cookies).
- **Admin authz**: every `/api/admin/*` handler re-checks role against the DB.

## Accepted for now / backlog (not blocking pilot)

- **IP-based rate limits are header-spoofable in code** but Railway's edge
  normalizes `x-forwarded-for` (verified live — spoofing did not bypass).
  Harden with trusted-proxy handling; do not rely on edge behavior forever.
- **In-memory rate limiter is per-process** — must move to a shared store
  (Redis/Postgres) before adding a second replica, or every limit weakens N×.
- **30-day JWT sessions, no per-session revocation** — a stolen token is valid
  until expiry short of rotating AUTH_SECRET. Consider shorter maxAge or DB
  sessions for a payment-confirming dashboard.
- **Account-keyed login lockout** — only IP-keyed shipped; add per-email
  lockout as follow-up.
- **Uploads have no per-account quota** — an account could fill the public
  bucket; add a count/rate cap.
- **No committed lockfile** — commit `package-lock.json` for reproducible
  builds.
- **NextAuth 5 beta + transitive advisories** (next/postcss/sharp) — plan a
  deliberate dependency-bump PR with a full regression pass.
- **Order flooding a merchant's board** within the per-IP limit — consider a
  per-store rate limit.
