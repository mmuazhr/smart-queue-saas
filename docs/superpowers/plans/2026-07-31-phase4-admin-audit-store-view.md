# Phase 4: Admin Store View + Audit Log — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin a read-only view into any merchant's store (queue, menu, details) for support — every access recorded in a new audit log.

**Architecture note (refinement of the spec, approved by orchestrator):** the spec sketched token-based session impersonation. This plan implements the same support capability as a **read-only admin store-detail page** instead — no session mechanics, no mutation risk, structurally read-only because the page only calls admin GET endpoints. The `audit_logs` table lands exactly as specced and every store view writes to it.

## Global Constraints

- Repo `/Users/muazhusaini/Documents/Project/QueLess/smart-queue-saas`; suite baseline = whatever Phase 3 left; never shrink; typecheck/build green per commit; stop dev before build. One commit per task. Never deploy. Orchestrator applies the prod migration.
- Admin gating identical to Phase 2's `requireAdmin` pattern (401/403 JSON).

---

### Task 1: audit_logs model + migration

**Files:**
- Modify: `prisma/schema.prisma` (append model)
- Create: `prisma/migrations/20260731110000_audit_logs/migration.sql`

**Interfaces:** Task 2 writes via `prisma.auditLog.create`.

- [ ] **Step 1: Schema** — append:

```prisma
model AuditLog {
  id        String   @id @default(uuid())
  actorId   String   @map("actor_id")
  action    String
  targetType String  @map("target_type")
  targetId  String   @map("target_id")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([actorId])
  @@index([targetType, targetId])
  @@map("audit_logs")
}
```

- [ ] **Step 2: Migration SQL** (hand-authored, consistent with repo style — `prisma migrate dev` has shadow-DB drift issues in this repo, use a manual folder + `npx prisma migrate deploy`):

```sql
-- Admin support actions must leave a trail (spec Phase 4).
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");
```

- [ ] **Step 3:** `npx prisma migrate deploy && npx prisma generate` (local DB) → applied; `npm run typecheck` clean.
- [ ] **Step 4: Commit** — `feat: audit_logs table for admin support actions`

---

### Task 2: Admin store-detail API (audited)

**Files:**
- Create: `src/app/api/admin/stores/[storeId]/route.ts`
- Modify: `src/app/api/admin/stores/[storeId]/status/route.ts` (add an audit write on status change)

**Interfaces:**
- Produces: `GET /api/admin/stores/[storeId]` → `{ success, data: { store: {...}, owner: { id, name, email }, activeOrders: [serialized orders], menuSummary: [{ category, itemCount }], todayStats: { orders, gmv } } }`. Task 3 consumes.

- [ ] **Step 1: GET route** — `requireAdmin` gate (copy Phase 2 pattern), then:

```ts
  const { storeId } = await params;
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  if (!store) {
    return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
  }

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const [activeOrders, categories, todayAgg] = await Promise.all([
    prisma.order.findMany({
      where: { storeId, status: { in: ["PAID", "ACCEPTED", "PREPARING", "READY"] } },
      orderBy: { createdAt: "asc" },
      include: { orderItems: true },
    }),
    prisma.category.findMany({
      where: { storeId },
      select: { name: true, _count: { select: { menuItems: true } } },
    }),
    prisma.order.aggregate({
      _count: true, _sum: { total: true },
      where: { storeId, status: { not: "CANCELLED" }, createdAt: { gte: dayStart } },
    }),
  ]);

  await prisma.auditLog.create({
    data: {
      actorId: gate.user.id,
      action: "ADMIN_STORE_VIEW",
      targetType: "store",
      targetId: storeId,
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      store: { id: store.id, name: store.name, slug: store.slug, status: store.status,
               createdAt: store.createdAt, operatingHours: store.operatingHours },
      owner: store.owner,
      activeOrders: activeOrders.map(toPlainOrder),
      menuSummary: categories.map((c) => ({ category: c.name, itemCount: c._count.menuItems })),
      todayStats: { orders: todayAgg._count, gmv: Number(todayAgg._sum.total ?? 0) },
    },
  });
```

Imports: `toPlainOrder` from `@/lib/serializers`. Check schema relation names (`owner`, `menuItems` under Category `_count`) against `prisma/schema.prisma` and adapt.

- [ ] **Step 2: Audit the status route** — in the Phase 2 status PATCH, after the update: `await prisma.auditLog.create({ data: { actorId: gate.user.id, action: parsed.data.status === "SUSPENDED" ? "ADMIN_STORE_SUSPEND" : "ADMIN_STORE_REACTIVATE", targetType: "store", targetId: storeId } })`.
- [ ] **Step 3: Verify** — as admin fetch the detail endpoint for the seed store (orders/menu/stats present), suspend+reactivate once, then `SELECT action, count(*) FROM audit_logs GROUP BY action` shows ADMIN_STORE_VIEW / SUSPEND / REACTIVATE rows. As merchant → 403.
- [ ] **Step 4: Checks + commit** — `feat: audited admin store-detail API; status changes write audit_logs`

---

### Task 3: Admin store-detail page

**Files:**
- Create: `src/app/admin/merchants/[storeId]/page.tsx`
- Modify: `src/app/admin/merchants/page.tsx` (store name cell links to `/admin/merchants/<storeId>`)

- [ ] **Step 1: Page** — client page fetching `GET /api/admin/stores/<storeId>`: header (store name, status badge, owner name/email, created date, link to public storefront), a read-only "READ-ONLY SUPPORT VIEW — actions are disabled" banner, today's stats cards (orders, GMV via formatPrice), the live-queue orders as read-only cards (queue #, customer, items, total — reuse the dashboard card layout minus Accept/Reject buttons), and the menu summary list. No mutating controls anywhere on this page except the existing suspend/reactivate which stays on the LIST page only.
- [ ] **Step 2: Link from the merchants table** (Phase 2 page).
- [ ] **Step 3: Verify** — as admin: navigate list → detail for the seed store; screenshot. Confirm zero POST/PUT/PATCH fired from the detail page (browse `network` log). Audit rows grew by exactly the number of views.
- [ ] **Step 4: Checks + commit** — `feat: read-only admin store support view`
