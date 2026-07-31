# Phase 2: Admin Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ADMIN-only `/admin` area: platform metrics overview, merchant/store oversight with suspend/reactivate.

**Architecture:** Same app. `/admin` pages use a server layout that `auth()`-gates on role ADMIN (copy the dashboard layout pattern). Admin APIs live under `/api/admin/*`; **every handler re-checks `session.user.role === "ADMIN"` itself** — the middleware only role-gates `/admin` pages, not `/api/admin`. SUSPENDED is a new store status value (string column — no migration): the public storefront and order creation treat it as unavailable.

**Tech Stack:** unchanged (Next 16, NextAuth v5, Prisma, zod, vitest).

## Global Constraints

- Repo: `/Users/muazhusaini/Documents/Project/QueLess/smart-queue-saas`. Suite currently **46 passing**; never shrink. `npm run typecheck` and `npm run build` green before every commit. Stop the dev server before running `npm run build` (shared `.next` corrupts).
- Commit per task, `<type>: <description>`, no footers. Do NOT deploy.
- `prisma` via `import prisma from "@/lib/prisma"` only. Money is Prisma `Decimal` — convert with `Number(...)` before arithmetic/JSON (see `src/lib/serializers.ts`).
- API error shape `{ success: false, error, code? }`. Admin-only rejection: 403 `{ code: "FORBIDDEN" }`.
- Local dev: `npx prisma dev` DB is running; seed merchant `merchant@test.my`/`merchant123` (store "Abang Burger"), seed admin `admin@smartqueue.my`/`admin123`. Browse binary: `$HOME/.claude/skills/gstack/browse/dist/browse`.

---

### Task 1: Store status schema + suspend gating

**Files:**
- Modify: `src/lib/validators.ts` (append), `src/lib/validators.test.ts` (append)
- Modify: `src/app/store/[slug]/page.tsx` (status check ~line 52 — currently accepts ACTIVE/CLOSED)
- Modify: `src/app/api/orders/route.ts` (status check ~line 93 — currently requires ACTIVE)

**Interfaces:**
- Produces: `adminStoreStatusSchema` = `z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]) })`, type `AdminStoreStatusInput`. Task 2 imports it.

- [ ] **Step 1: Failing tests** — append to `validators.test.ts`:

```ts
import { adminStoreStatusSchema } from "./validators";

describe("adminStoreStatusSchema", () => {
  it("accepts ACTIVE and SUSPENDED", () => {
    expect(adminStoreStatusSchema.safeParse({ status: "ACTIVE" }).success).toBe(true);
    expect(adminStoreStatusSchema.safeParse({ status: "SUSPENDED" }).success).toBe(true);
  });
  it("rejects other values", () => {
    expect(adminStoreStatusSchema.safeParse({ status: "PENDING" }).success).toBe(false);
    expect(adminStoreStatusSchema.safeParse({ status: "deleted" }).success).toBe(false);
  });
});
```

Run `npm run test` → FAIL (not exported).

- [ ] **Step 2: Implement** — append to `validators.ts`:

```ts
// ---- Admin Schemas ----

export const adminStoreStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export type AdminStoreStatusInput = z.infer<typeof adminStoreStatusSchema>;
```

Run `npm run test` → 48 passing.

- [ ] **Step 3: Gate the storefront** — in `src/app/store/[slug]/page.tsx`, find the status check that renders the "Store Unavailable" state and ensure SUSPENDED lands there too (it must NOT be treated like ACTIVE/CLOSED). If the check is an allowlist (`status !== "ACTIVE" && status !== "CLOSED"` → unavailable) SUSPENDED already falls through — in that case just verify. In `src/app/api/orders/route.ts`, the existing `status === "ACTIVE"` requirement already rejects SUSPENDED — verify, don't change.

- [ ] **Step 4: Verify behaviorally** — local dev running: set Abang Burger to SUSPENDED directly (one-off node script with pg, `UPDATE stores SET status='SUSPENDED' WHERE slug='abang-burger'`), load `/store/abang-burger` → unavailable state, POST an order → rejected. Restore to ACTIVE and verify storefront works again.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators.ts src/lib/validators.test.ts src/app/store/ src/app/api/orders/route.ts
git commit -m "feat: SUSPENDED store status schema and public gating"
```

---

### Task 2: Admin APIs (overview, merchants, status)

**Files:**
- Create: `src/app/api/admin/overview/route.ts`
- Create: `src/app/api/admin/merchants/route.ts`
- Create: `src/app/api/admin/stores/[storeId]/status/route.ts`

**Interfaces:**
- Consumes: `adminStoreStatusSchema` (Task 1).
- Produces (Task 3 consumes):
  - `GET /api/admin/overview` → `{ success, data: { merchants, stores, activeStores, ordersToday, orders7d, gmvToday, gmv7d } }` (numbers; GMV in RM as float)
  - `GET /api/admin/merchants` → `{ success, data: [{ userId, name, email, createdAt, store: { id, name, slug, status, createdAt, orderCount, gmv } | null }] }`
  - `PATCH /api/admin/stores/[storeId]/status` body `{ status }` → `{ success, data: { id, status } }`

- [ ] **Step 1: Shared admin gate helper** — top of each route file (repeat in each file, no new shared module — three lines):

```ts
async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  if (session.user.role !== "ADMIN") return "forbidden" as const;
  return session;
}
```

Handlers start:

```ts
  const gate = await requireAdmin();
  if (gate === null) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (gate === "forbidden") return NextResponse.json({ success: false, code: "FORBIDDEN", error: "Admin only" }, { status: 403 });
```

- [ ] **Step 2: `overview/route.ts`** —

```ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";

// (requireAdmin helper as above)

export async function GET() {
  // gate as above
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const notCancelled = { status: { not: "CANCELLED" } } as const;

  const [merchants, stores, activeStores, ordersToday, orders7d, gmvTodayAgg, gmv7dAgg] =
    await Promise.all([
      prisma.user.count({ where: { role: "MERCHANT" } }),
      prisma.store.count(),
      prisma.store.count({ where: { status: "ACTIVE" } }),
      prisma.order.count({ where: { ...notCancelled, createdAt: { gte: dayStart } } }),
      prisma.order.count({ where: { ...notCancelled, createdAt: { gte: week } } }),
      prisma.order.aggregate({ _sum: { total: true }, where: { ...notCancelled, createdAt: { gte: dayStart } } }),
      prisma.order.aggregate({ _sum: { total: true }, where: { ...notCancelled, createdAt: { gte: week } } }),
    ]);

  return NextResponse.json({
    success: true,
    data: {
      merchants, stores, activeStores, ordersToday, orders7d,
      gmvToday: Number(gmvTodayAgg._sum.total ?? 0),
      gmv7d: Number(gmv7dAgg._sum.total ?? 0),
    },
  });
}
```

- [ ] **Step 3: `merchants/route.ts`** —

```ts
export async function GET() {
  // gate as above
  const users = await prisma.user.findMany({
    where: { role: "MERCHANT" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, email: true, createdAt: true,
      stores: { select: { id: true, name: true, slug: true, status: true, createdAt: true } },
    },
  });
  const data = await Promise.all(
    users.map(async (u) => {
      const store = u.stores[0] ?? null;
      let orderCount = 0, gmv = 0;
      if (store) {
        const agg = await prisma.order.aggregate({
          _count: true, _sum: { total: true },
          where: { storeId: store.id, status: { not: "CANCELLED" } },
        });
        orderCount = agg._count; gmv = Number(agg._sum.total ?? 0);
      }
      return { userId: u.id, name: u.name, email: u.email, createdAt: u.createdAt,
               store: store ? { ...store, orderCount, gmv } : null };
    })
  );
  return NextResponse.json({ success: true, data });
}
```

Note: `stores` relation field name — check `prisma/schema.prisma` User model for the exact relation name (`stores` vs `Store`); use what the schema says.

- [ ] **Step 4: `stores/[storeId]/status/route.ts`** —

```ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { adminStoreStatusSchema } from "@/lib/validators";

// (requireAdmin helper)

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  // gate as above
  const { storeId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = adminStoreStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed" }, { status: 400 });
  }
  const store = await prisma.store.update({
    where: { id: storeId },
    data: { status: parsed.data.status },
    select: { id: true, status: true },
  });
  return NextResponse.json({ success: true, data: store });
}
```

(Next 16 App Router: `params` is a Promise — match the pattern in `src/app/api/stores/[storeId]/route.ts`.)

- [ ] **Step 5: Verify** — browse logged in as seed admin (`admin@smartqueue.my`/`admin123`): fetch `/api/admin/overview` → numbers; `/api/admin/merchants` → array with Abang Burger; PATCH status SUSPENDED then back to ACTIVE. Then as merchant → expect 403 FORBIDDEN on all three.

- [ ] **Step 6: Checks + commit**

`npm run test && npm run typecheck` → 48 passing, clean.

```bash
git add src/app/api/admin/
git commit -m "feat: admin APIs — overview metrics, merchants listing, store status control"
```

---

### Task 3: Admin UI

**Files:**
- Create: `src/app/admin/layout.tsx` (server gate + shell — copy the pattern of `src/app/dashboard/layout.tsx` but require role === "ADMIN"; redirect others to `/?error=unauthorized`)
- Create: `src/app/admin/AdminShell.tsx` (client sidebar: "Overview" `/admin`, "Merchants" `/admin/merchants`; copy DashboardShell's structure/styling, brand mark links to `/admin`)
- Create: `src/app/admin/page.tsx` (Overview)
- Create: `src/app/admin/merchants/page.tsx` (Merchants)

**Interfaces:** consumes Task 2's three endpoints exactly as specified.

- [ ] **Step 1: layout.tsx**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AdminShell from "./AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/admin");
  if (session.user.role !== "ADMIN") redirect("/?error=unauthorized");
  return <AdminShell>{children}</AdminShell>;
}
```

- [ ] **Step 2: AdminShell.tsx** — client component copying DashboardShell's sidebar markup (same glass styling, THEME toggle, Sign Out) with two nav items (Overview, Merchants) and the header text "QueLess Admin".

- [ ] **Step 3: Overview page** — client page fetching `/api/admin/overview`; render 7 stat cards in the analytics StatCard visual style (label, big number; GMV values through `formatPrice`); loading spinner; error state with retry button (same pattern as dashboard queue's error state).

- [ ] **Step 4: Merchants page** — client page fetching `/api/admin/merchants`; table (overflow-x-auto container): Merchant (name + email), Store (name + slug link to `/store/<slug>` target _blank), Status badge (green ACTIVE / red SUSPENDED / gray none), Created (date), Orders, GMV (formatPrice). Row action button: if ACTIVE → "Suspend" (red outline); if SUSPENDED → "Reactivate". Click → `PATCH /api/admin/stores/<id>/status` with pending state on the button → refetch list. Confirmation via `window.confirm("Suspend <store>? Customers will not be able to order.")` before suspending (not for reactivate).

- [ ] **Step 5: Verify in browser** — as admin: /admin shows metrics; /admin/merchants lists seed merchant; Suspend → storefront `/store/abang-burger` unavailable; Reactivate → works again. As merchant: /admin redirects to `/?error=unauthorized`. Screenshots of both admin pages to the scratchpad.

- [ ] **Step 6: Checks + commit** — stop dev server, `npm run test && npm run typecheck && npm run build` → 48, clean, green.

```bash
git add src/app/admin/
git commit -m "feat: admin dashboard — overview metrics and merchant oversight with suspend/reactivate"
```
