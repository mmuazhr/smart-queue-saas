# QueLess Three-Surface Architecture — Design

Date: 2026-07-31 · Status: approved (Muaz) · Approach: A (one app, three route territories)

## Context

QueLess is live at https://queless.muazhusainirosli.workers.dev (Cloudflare Workers via
OpenNext, Supabase Postgres via Hyperdrive). Merchants have `/dashboard` (queue, menu,
orders, analytics, settings incl. store creation + hours). Customers have the anonymous
`/store/[slug]` flow. Admin exists only as a role string — no routes.

Locked product decisions:
- **Customers stay anonymous.** No customer accounts; the scan-and-order wedge is the moat.
- **Stores self-activate** on creation (no approval queue).
- Merchant-of-record stays per-merchant (Model A) whenever online payments are wired — QueLess never holds funds.

## Architecture

One Next.js app, one Worker, three route territories:

| Territory | Path | Auth | State today |
|---|---|---|---|
| Admin | `/admin/*` | role=ADMIN (middleware gate already exists) | build from zero |
| Seller | `/dashboard/*` | role=MERCHANT\|ADMIN | exists; account mgmt missing |
| Customer | `/store/[slug]/*` | anonymous | exists; polish + 2 bug fixes |

Admin pages copy the dashboard pattern: server layout does `auth()` fresh-role check,
client shell renders. No new packages, no second deploy, same design language
(glass cards, orange accent, Tailwind vars).

## Phase 1 — Seller account management (~half day)

- New `/dashboard/account` page + sidebar nav item ("Account").
- Edit profile: name, email (uniqueness re-checked), phone (optional, clearable).
- Change password: requires current password (bcrypt compare server-side), min 8 chars,
  re-hash cost 12.
- New APIs: `PUT /api/account` (profile), `PUT /api/account/password`. Both derive the
  user id from the session only — no id in the payload.
- Folds in known paper cuts: `optionalPhoneSchema` gets an explicit clear path
  (send `null` to clear; "" remains "unchanged"), and `#mobile-menu-toggle` in
  DashboardShell gets its aria-label.

## Phase 2 — Admin v1 (~1 day)

- `/admin` shell (sidebar: Overview, Merchants) gated ADMIN-only.
- **Overview**: total merchants, total/active stores, orders today + 7d, GMV (RM) today + 7d.
  Two aggregate queries; read-only.
- **Merchants**: table joining users→stores: email, store name/slug/status, created,
  order count, GMV. Row actions: suspend / reactivate.
- `SUSPENDED` added to store status values (string column, no migration needed).
  Storefront and `POST /api/orders` treat SUSPENDED like unavailable with copy
  "This store is currently unavailable." `PATCH /api/admin/stores/[id]/status` is the
  only writer, ADMIN-only.
- Admin APIs live under `/api/admin/*`; middleware already 401s non-admin JSON calls.

## Phase 3 — Customer polish (~1 day, no accounts)

- **Overnight hours fix (bug)**: `close < open` must wrap past midnight (17:00–00:00,
  22:00–03:00). Today such windows are unsatisfiable — night-market stalls read closed
  on their busiest nights. Fix in `store-hours.ts` + tests (17:00–00:00 at 23:59 → open;
  02:00 next day within 22:00–03:00 → open).
- **isStoreOpen unification (bug)**: delete the browser-local duplicate in `utils.ts`;
  everything uses the Asia/Kuala_Lumpur-aware `store-hours.ts` implementation so the
  badge and the order API can never disagree.
- **Receipt view**: order page gets a clean shareable/printable receipt state after
  COMPLETED (store name, items, totals, SST, queue number, timestamp).
- **Find my order**: storefront link → enter phone → today's orders for that store
  (rate-limited, phone+storeId scoped, no cross-store enumeration).
- **PWA nudge** on the order-tracking page (the natural waiting moment).
- **Mobile nav hamburger** on the landing page (QA finding: nav links are 0×0 at 375px).

## Phase 4 — Admin v1.5 (impersonation, audited)

- "View as merchant": ADMIN mints a short-lived (15 min) signed token; opening it renders
  the merchant dashboard **read-only** (mutating APIs reject impersonated sessions).
- Every mint + use appended to new `audit_logs` table (actor, target, action, ts).
  This table is the seed of admin audit generally.
- Prisma migration required (audit_logs) — the only schema change in this design.

## Explicitly out of scope

- Billing/subscription management (no billing layer exists; gets its own spec first).
- Customer accounts of any kind.
- Multi-staff merchant accounts.
- Payment gateway wiring (Billplz DuitNow QR — separate decision ticket pending).

## Error handling & testing

- Every new API: zod-validated input, session-derived identity, JSON errors with
  status codes matching the middleware conventions (401 JSON for APIs).
- Vitest per phase: account APIs (password rules, email uniqueness), suspend gating
  (storefront + orders reject), overnight-hours matrix, find-my-order scoping.
  Suite currently 40 — grows each phase, never shrinks.
- Live browser walk on production before each phase is called done (session discipline).

## Build order & shippability

P1 → P2 → P3 → P4, each independently deployable. If anything preempts, P3's two bug
fixes (overnight hours, isStoreOpen unification) can be cherry-picked ahead — they're
self-contained.
