# QueLess — Smart Queue SaaS

Digital queue management for food & retail merchants: customers scan a QR
code, join the queue or order ahead, and track their live position — no app
install. Merchants run everything from a dashboard: menu, orders, queue
capacity, and payment confirmation.

Live at [queless-production.up.railway.app](https://queless-production.up.railway.app).

## Tech stack

Next.js 15 (App Router) · TypeScript · Prisma + PostgreSQL (Supabase) ·
NextAuth.js v5 · Tailwind · Zustand · Vitest · Sentry · deployed on Railway.

## How payment works

QueLess never touches customer money. Each merchant connects their own bank
account via a DuitNow QR code (Settings → Payments & Charges), configures up
to 5 flat charges (e.g. SST, service charge), and customers pay by scanning
that QR in their own banking app, then upload a screenshot as proof. Orders
sit in an "Unconfirmed" column until the merchant confirms the payment — the
customer's queue number is issued only after confirmation. Cash orders go
through the same confirm gate. Order lifecycle: confirmed → accepted →
preparing → ready → completed.

## Setup

```bash
npm install
```

Create `.env` (see `src/lib/config.ts` / `prisma/schema.prisma` for the full
list) with at minimum:

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Postgres (Supabase) connection |
| `AUTH_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | NextAuth session |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client (storage, realtime) |

Then:

```bash
npx prisma generate && npx prisma migrate deploy
npm run dev          # http://localhost:3000
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Dev server / production build / serve |
| `npm test` / `npm run test:coverage` | Vitest unit tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## Deployment

Railway (`railway.json`): Nixpacks build, `npm run start`, health check on
`/api/health`. Real secrets are injected by Railway — CI only ever sees
placeholder values (see `.github/workflows/ci.yml`).

## Project layout

```
src/
├─ app/
│  ├─ store/[slug]/    customer-facing menu, checkout, order tracking
│  ├─ dashboard/        merchant queue/order management
│  ├─ admin/            platform admin
│  ├─ (auth)/           login/register
│  └─ api/              route handlers
├─ lib/                 domain logic: eta.ts, capacity.ts, order-timer.ts, ...
└─ components/
prisma/                 schema + migrations
docs/                   specs, plans, audits
```

## Tests

```bash
npm test              # unit tests (Vitest)
npm run test:coverage # with coverage
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests, and a production
build on every push to `main`.
