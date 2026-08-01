# Railway Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the QueLess origin from Cloudflare Workers (OpenNext) to a long-lived Node process on Railway, keeping Cloudflare as DNS/CDN/WAF — eliminating Error 1102 and making the in-memory rate limiter functional.

**Architecture:** Strip the Workers-only branch from the Prisma singleton (the Node path already exists and is proven against production Supabase), delete the OpenNext/wrangler toolchain, add a health endpoint, deploy with plain `next build`/`next start` on Railway (Singapore), then cut DNS over behind Cloudflare's proxy. Sentry rides along for observability.

**Tech Stack:** Next.js 16 (see Global Constraints), Prisma + `@prisma/adapter-pg`, Railway Nixpacks Node build, Cloudflare Free (DNS/CDN/WAF), Sentry.

## Global Constraints

- **This is NOT the Next.js you know** (repo `AGENTS.md`): read the relevant guide in `node_modules/next/dist/docs/` before writing any route/page code. Heed deprecation notices.
- Commits: `<type>: <description>` (feat, fix, refactor, docs, test, chore). No attribution footers.
- Do not run `prisma db seed` against production — its `deleteMany()` calls wipe every table.
- Production DB is Supabase `aws-0-ap-southeast-1`; connection string lives in `.env.production.local` (never commit it).
- Verification commands: `npm test` (vitest), `npm run typecheck`, `npm run build`.
- **USER-ASSISTED** steps require Muaz at the keyboard (account signups, `railway login`, DNS). Pause and ask; never work around them.

---

### Task 1: Strip Cloudflare coupling from the codebase

**Files:**
- Modify: `src/lib/prisma.ts` (full rewrite below)
- Delete: `wrangler.jsonc`, `open-next.config.ts`, `cloudflare-env.d.ts`
- Modify: `package.json` (remove dep `@opennextjs/cloudflare`, devDep `wrangler`; remove scripts `preview`, `deploy:cf`, `cf-typegen`)
- Modify: `.gitignore` — remove `.open-next` entry if present (check first; leave file otherwise untouched)

**Interfaces:**
- Produces: `prisma` singleton export, unchanged import surface (`import { prisma } from "@/lib/prisma"`). No caller changes anywhere.

- [ ] **Step 1: Verify the current baseline is green**

Run: `npm test && npm run typecheck`
Expected: 81 tests pass, typecheck clean. If not, STOP and report — do not migrate on a red baseline.

- [ ] **Step 2: Replace `src/lib/prisma.ts` entirely with the Node-only singleton**

```typescript
// =============================================================================
// Prisma Client Singleton
// =============================================================================
// Prevents multiple Prisma Client instances during Next.js hot-reload in dev.
// Uses the node-postgres driver adapter with a normal long-lived pool.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL not configured");
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
```

Note: the lazy Proxy wrapper existed only so Workers bindings would be ready before connection-string resolution. On Node, `DATABASE_URL` is set at process start, so a plain eager singleton is correct and simpler. `$transaction` continues to work because callers hold the one concrete client.

- [ ] **Step 3: Delete the Cloudflare files and package entries**

```bash
git rm wrangler.jsonc open-next.config.ts cloudflare-env.d.ts
npm uninstall @opennextjs/cloudflare wrangler
```

Then edit `package.json` scripts: delete the `preview`, `deploy:cf`, and `cf-typegen` lines. Keep `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:coverage`.

- [ ] **Step 4: Sweep for stragglers**

Run: `grep -rn "opennextjs\|getCloudflareContext\|CloudflareEnv\|HYPERDRIVE" src/ next.config.* package.json`
Expected: zero hits in `src/`. If `next.config.*` contains an OpenNext wrapper (e.g. `initOpenNextCloudflareForDev`), remove that wrapper and keep the plain Next config.

- [ ] **Step 5: Verify green**

Run: `npm test && npm run typecheck && npm run build`
Expected: 81 tests pass, typecheck clean, `next build` completes without OpenNext.

- [ ] **Step 6: Smoke-test the production server locally**

```bash
npm run build
DATABASE_URL="<local dev DB url from .env>" NEXTAUTH_URL=http://localhost:3000 NEXTAUTH_SECRET=dev-secret npm run start &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/   # expect 200
kill %1
```

(If the local `prisma dev` DB at port 51230 is not running, landing page must still return 200 because it does not query the DB; note any 500 and investigate before proceeding.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove Cloudflare Workers coupling, Node-only Prisma singleton"
```

---

### Task 2: Health endpoint

**Files:**
- Create: `src/app/api/health/route.ts`

**Interfaces:**
- Produces: `GET /api/health` → `200 {"ok":true}` when the DB answers, `503 {"ok":false}` when it doesn't. Railway's healthcheck consumes this path.

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/health — liveness + DB reachability, used by Railway healthcheck
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm test`
Expected: clean. (No unit test for this route — it is pure I/O; it gets exercised live in Task 3 Step 5.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/health/route.ts
git commit -m "feat: add /api/health for Railway healthcheck"
```

---

### Task 3: Railway project + first deploy — **USER-ASSISTED**

**Files:**
- Create: `railway.json` (build/healthcheck config)

**Interfaces:**
- Consumes: green build from Task 1, `/api/health` from Task 2.
- Produces: live app at `https://<project>.up.railway.app` running against production Supabase.

- [ ] **Step 1 (USER): Sign up + authenticate the CLI**

Ask Muaz to: create an account at railway.com (Hobby plan), then run in this session:
`! npm i -g @railway/cli && railway login`
(`railway login` is interactive/browser-based — it must be user-run.)

- [ ] **Step 2: Create `railway.json`**

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "npm run start",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 120,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  }
}
```

- [ ] **Step 3: Initialise the project and set environment variables**

```bash
railway init --name queless   # choose the Singapore region when prompted
railway variables --set "DATABASE_URL=<value of DATABASE_URL from .env.production.local>" \
  --set "DIRECT_URL=<value of DIRECT_URL from .env.production.local, if present — else same as DATABASE_URL>" \
  --set "NEXTAUTH_SECRET=<existing production secret — read it from Cloudflare: npx wrangler secret list is names-only, so take it from wherever it is recorded; if unrecoverable, generate a new one with openssl rand -base64 32 and note that all existing sessions will be invalidated>" \
  --set "NEXTAUTH_URL=https://<project>.up.railway.app" \
  --set "AUTH_TRUST_HOST=true" \
  --set "NODE_ENV=production"
```

Do NOT set Twilio/Stripe/Billplz vars — payments are being replaced (separate plan) and Twilio can be added when SMS packs ship.

- [ ] **Step 4: Deploy**

Run: `railway up`
Expected: Nixpacks detects Node, runs `npm ci && npm run build`, deploy goes healthy (healthcheck `/api/health` returns 200 — proves DB connectivity from Railway to Supabase).

- [ ] **Step 5: Verify the deployed app end-to-end**

```bash
RAILWAY_URL=$(railway domain)   # or read it from the dashboard
curl -s -o /dev/null -w "%{http_code}\n" https://$RAILWAY_URL/api/health   # expect 200
curl -s -o /dev/null -w "%{http_code}\n" https://$RAILWAY_URL/store/abang-burger  # expect 200 or 404 per prod data — NOT 500
```

Then with the gstack browse binary (`$HOME/.claude/skills/gstack/browse/dist/browse`) or curl: log in at `https://$RAILWAY_URL/login` as `admin@queless.app` / `admin1234` → expect redirect to dashboard, not to any `workers.dev` URL. Open the merchant dashboard as `demo@queless.app` / `demo1234` and confirm the SSE stream connects (network tab shows `/api/queue/stream` staying open, updates every ~3s).

- [ ] **Step 6: Commit**

```bash
git add railway.json
git commit -m "chore: add Railway deploy config"
```

---

### Task 4: Sentry — **USER-ASSISTED (DSN)**

**Files:**
- Create: `sentry.server.config.ts`, `sentry.edge.config.ts` (only if the wizard requires), `src/instrumentation.ts` (or as current Next docs dictate — READ `node_modules/next/dist/docs/` on instrumentation first)
- Modify: `next.config.ts` (wrap with `withSentryConfig`), `package.json` (add `@sentry/nextjs`)

**Interfaces:**
- Consumes: `SENTRY_DSN` env var (user creates the Sentry project).
- Produces: server-side errors reported to Sentry; no behaviour change when `SENTRY_DSN` unset.

- [ ] **Step 1 (USER):** Ask Muaz to create a free Sentry account/project (platform: Next.js) and paste the DSN.

- [ ] **Step 2: Install and configure minimally**

```bash
npm install @sentry/nextjs
```

Follow the CURRENT `@sentry/nextjs` manual setup docs for this Next version (do not trust memory; the instrumentation file location changed across Next majors — check `node_modules/next/dist/docs/` for the instrumentation hook and Sentry's manual-setup guide). Configuration must be guarded:

```typescript
// sentry.server.config.ts
import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
```

- [ ] **Step 3: Verify locally that absence of DSN is a no-op**

Run: `npm run build && npm test && npm run typecheck`
Expected: green with no `SENTRY_DSN` set.

- [ ] **Step 4: Set the DSN on Railway and verify capture**

```bash
railway variables --set "SENTRY_DSN=<dsn>"
railway up
```

Trigger a test error (e.g. `curl https://$RAILWAY_URL/api/orders/not-a-real-id` repeatedly or a temporary `/api/debug-sentry` route — if you add one, delete it in the same task) and confirm the event appears in Sentry. 

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Sentry error monitoring (server-side, DSN-gated)"
```

---

### Task 5: Cutover + Cloudflare hardening — **USER-ASSISTED**

**Files:** none (infrastructure only)

**Interfaces:**
- Consumes: verified Railway deployment (Task 3–4).
- Produces: production traffic served by Railway behind Cloudflare; Workers deployment retired; WAF rate rule live.

- [ ] **Step 1 (USER): Point DNS at Railway.** In the Railway dashboard add the custom domain (whichever hostname merchants will use). Railway shows a CNAME target. In Cloudflare DNS, create/repoint the CNAME to that target, **proxy ON** (orange cloud).

- [ ] **Step 2: Update auth URL and redeploy**

```bash
railway variables --set "NEXTAUTH_URL=https://<final-domain>"
railway up
```

- [ ] **Step 3: Verify login on the final domain.** Log in as `demo@queless.app` on `https://<final-domain>/login`; confirm the redirect stays on the final domain (no `workers.dev`, no `up.railway.app`). Place a test CASH order on the demo storefront and watch it appear on the merchant dashboard. This is the full-stack proof.

- [ ] **Step 4 (USER): WAF rate rule.** Cloudflare dashboard → Security → WAF → Rate limiting rules → new rule: expression `(http.request.uri.path eq "/api/orders" and http.request.method eq "POST")`, 10 requests / 1 minute per IP, action Block. (Free plan allows 1 rate-limiting rule — this endpoint is the right one to spend it on.)

- [ ] **Step 5 (USER): Retire the Worker.** Cloudflare → Workers → `queless` → remove routes/disable. Downgrade the Workers Paid subscription. Keep Hyperdrive config (harmless, unused).

- [ ] **Step 6: Record the change**

```bash
git commit --allow-empty -m "chore: production origin cut over from Cloudflare Workers to Railway"
```

---

## Rollback

The Worker deployment is untouched until Task 5 Step 5. At any point before that, rollback = repoint DNS back to the Worker route. After Step 5, rollback = `git revert` the coupling-removal commit and `npm run deploy:cf` from the pre-migration commit (`git checkout <sha> -- wrangler.jsonc open-next.config.ts` restores config).

**OBSOLETE as of Task 5 (2026-08-01):** the Worker is deleted and `deploy:cf` removed; this rollback path cannot execute. Actual rollback: redeploy the previous Railway deployment from the Railway dashboard.
