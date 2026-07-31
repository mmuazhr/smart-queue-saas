# Phase 3: Customer Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two open-hours correctness bugs, add find-my-order + receipt polish + PWA nudge for anonymous customers, and give the landing page a mobile nav.

**Architecture:** No new auth surface — customers stay anonymous. All hours logic converges on `src/lib/store-hours.ts` (KL-timezone-aware, pure, tested); the browser-local duplicate in `utils.ts` is deleted. New public lookup endpoint is rate-limited and scoped to one store + one phone + today.

## Global Constraints

- Repo `/Users/muazhusaini/Documents/Project/QueLess/smart-queue-saas`; suite baseline is whatever Phase 2 left (expect 48) — never shrink; typecheck/build green per commit; stop dev server before `npm run build`.
- One commit per task, `<type>: <description>`, no footers. Never deploy.
- Public API rate limiting uses the existing `checkRateLimit`/`getClientIp` from `src/lib/rate-limit.ts` (see `src/app/api/orders/route.ts` for the usage pattern).
- Local dev: seed store `abang-burger` (17:00–00:00 Fri/Sat in seed — the literal overnight case). Browse binary as in prior phases.

---

### Task 1: Overnight operating hours (the pasar malam bug)

**Files:**
- Modify: `src/lib/store-hours.ts`
- Test: `src/lib/store-hours.test.ts` (append)

**Interfaces:** `isStoreOpen(operatingHours, now?, timeZone?)` signature unchanged; callers unaffected.

- [ ] **Step 1: Failing tests** — append to `store-hours.test.ts` (follow its existing helpers for constructing `now` dates; it already tests with explicit Date objects — reuse that pattern):

```ts
describe("overnight windows (close < open wraps past midnight)", () => {
  const overnight = {
    friday: { open: "17:00", close: "00:00", isClosed: false },
    saturday: { open: "22:00", close: "03:00", isClosed: false },
    sunday: { open: "09:00", close: "21:00", isClosed: true },
  };

  it("17:00-00:00 is open at 23:59 MYT Friday", () => {
    // 2026-07-31 is a Friday; 23:59 MYT = 15:59 UTC
    expect(isStoreOpen(overnight, new Date("2026-07-31T15:59:00Z"))).toBe(true);
  });

  it("17:00-00:00 is open exactly at midnight MYT (00:00 Saturday, Friday's close)", () => {
    // 00:00 Sat MYT = 16:00 UTC Friday
    expect(isStoreOpen(overnight, new Date("2026-07-31T16:00:00Z"))).toBe(true);
  });

  it("22:00-03:00 Saturday is open at 01:30 MYT Sunday (yesterday's spill)", () => {
    // 01:30 Sun MYT = 17:30 UTC Saturday — sunday itself is closed, but
    // saturday's window spills past midnight
    expect(isStoreOpen(overnight, new Date("2026-08-01T17:30:00Z"))).toBe(true);
  });

  it("22:00-03:00 Saturday is closed at 04:00 MYT Sunday (spill ended)", () => {
    expect(isStoreOpen(overnight, new Date("2026-08-01T20:00:00Z"))).toBe(false);
  });

  it("17:00-00:00 is closed at 12:00 MYT Friday (before opening)", () => {
    expect(isStoreOpen(overnight, new Date("2026-07-31T04:00:00Z"))).toBe(false);
  });
});
```

Run `npm run test` → the wrap cases FAIL against the current `open <= t <= close` comparison.

- [ ] **Step 2: Implement** — replace the body of `isStoreOpen` from the `hours` lookup down:

```ts
  const currentTime = new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(now);

  const withinWindow = (entry: OperatingHoursEntry): boolean => {
    if (entry.isClosed) return false;
    if (entry.close < entry.open) {
      // Overnight window (e.g. 17:00–00:00, 22:00–03:00): the same-day part.
      // "00:00" as close means exactly midnight and only matches the spill check.
      return currentTime >= entry.open;
    }
    return currentTime >= entry.open && currentTime <= entry.close;
  };

  const hours = operatingHours[dayName];
  if (hours && withinWindow(hours)) return true;

  // Yesterday's overnight window can spill into the small hours of today
  // (a stall open Sat 22:00–03:00 is still open at 01:30 Sunday).
  const dayIndex = DAYS_OF_WEEK.indexOf(dayName);
  const yesterdayName = DAYS_OF_WEEK[(dayIndex + 6) % 7];
  const yesterday = operatingHours[yesterdayName];
  if (
    yesterday &&
    !yesterday.isClosed &&
    yesterday.close < yesterday.open &&
    currentTime <= yesterday.close
  ) {
    return true;
  }

  return false;
```

Delete the now-unused old return line and the `if (!hours || hours.isClosed) return false;` (the logic above supersedes it — note: a missing/closed today entry no longer short-circuits, because yesterday's spill must still be considered).

- [ ] **Step 3: Run tests** — `npm run test` → all pass including the 5 new; existing store-hours tests must still pass (00:00-anchored midnight-exactly test: `currentTime <= "00:00"` is only true at exactly 00:00 — that's the intended close-at-midnight boundary).

- [ ] **Step 4: Commit**

```bash
git add src/lib/store-hours.ts src/lib/store-hours.test.ts
git commit -m "fix: overnight operating hours wrap past midnight, including yesterday's spill window"
```

---

### Task 2: One isStoreOpen implementation

**Files:**
- Modify: `src/lib/utils.ts` (DELETE its local `isStoreOpen` around line 69)
- Modify: every importer of the utils version — find with `grep -rn "isStoreOpen" src --include="*.ts" --include="*.tsx"` and repoint to `import { isStoreOpen } from "@/lib/store-hours"`.

**Interfaces:** the store-hours signature takes `(operatingHours, now?, timeZone?)` — callers that passed the utils version's argument shape must be adapted (check each call site's arguments; the storefront badge is the known consumer).

- [ ] **Step 1:** Grep, repoint every consumer, delete the duplicate from `utils.ts`.
- [ ] **Step 2:** `npm run test && npm run typecheck` → clean; grep confirms exactly one `export function isStoreOpen` in the repo.
- [ ] **Step 3:** Behavioral check on local dev: seed store has Fri/Sat 17:00–00:00 — on a Friday afternoon KL it should show Closed, after 17:00 Open; with Task 1 the badge and the order API can no longer disagree (both use the same function). At minimum verify the storefront renders and the badge state matches what `isStoreOpen` returns for the current time.
- [ ] **Step 4: Commit** — `fix: single timezone-aware isStoreOpen — storefront badge and order API can no longer disagree`

---

### Task 3: Find my order (anonymous lookup)

**Files:**
- Create: `src/app/api/orders/lookup/route.ts`
- Modify: `src/app/store/[slug]/page.tsx` (add a "Find my order" link under the header, pointing to `/store/<slug>/find`)
- Create: `src/app/store/[slug]/find/page.tsx`

**Interfaces:**
- Produces: `GET /api/orders/lookup?storeId=<uuid>&phone=<msisdn>` → `{ success, data: [{ id, queueNumber, status, total, createdAt }] }` — today's non-cancelled orders for that store+phone only. 429 on rate limit; 400 on invalid phone/storeId.

- [ ] **Step 1: Implement the route** —

```ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { phoneSchema } from "@/lib/validators";
import { z } from "zod";

const lookupSchema = z.object({
  storeId: z.string().uuid(),
  phone: phoneSchema,
});

export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers);
  if (!checkRateLimit(`lookup:${ip}`, 10)) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = lookupSchema.safeParse({
    storeId: searchParams.get("storeId"),
    phone: searchParams.get("phone"),
  });
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid store or phone" }, { status: 400 });
  }

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const orders = await prisma.order.findMany({
    where: {
      storeId: parsed.data.storeId,
      customerPhone: parsed.data.phone,
      createdAt: { gte: dayStart },
      status: { not: "CANCELLED" },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, queueNumber: true, status: true, total: true, createdAt: true },
  });

  return NextResponse.json({
    success: true,
    data: orders.map((o) => ({ ...o, total: Number(o.total) })),
  });
}
```

Check `prisma/schema.prisma` Order model for the exact phone field name (`customerPhone` mapped column) and adjust if needed. NOTE: this route must be publicly reachable — `/api/orders` is already in the middleware PUBLIC_PATHS prefix list, and `/api/orders/lookup` matches the `p + "/"` prefix rule, so no middleware change is needed; verify with an unauthenticated curl.

- [ ] **Step 2: Find page** — `src/app/store/[slug]/find/page.tsx`: client page styled like the checkout page. Phone input (`+60` hint), "Find my orders" button (pending state), results as cards linking each order to `/store/<slug>/order/<id>`; empty result → "No orders today for this number."; 429 → "Too many attempts — wait a minute."; back link to the storefront. Resolve `storeId` the way checkout does (grep how checkout obtains it — reuse that mechanism).
- [ ] **Step 3: Storefront link** — small "Find my order" text link near the store header in `src/app/store/[slug]/page.tsx` pointing to `/store/<slug>/find`.
- [ ] **Step 4: Verify** — local dev: place a cash order for `0123456789`, then look it up via the find page (correct order listed, opens tracking page); wrong phone → empty message; 11 rapid API hits → 429. Unauthenticated curl of the lookup URL works (no login redirect).
- [ ] **Step 5: Checks + commit** — `feat: anonymous find-my-order lookup (store+phone+today scoped, rate limited)`

---

### Task 4: Receipt view + PWA nudge on the order page

**Files:**
- Modify: `src/app/store/[slug]/order/[orderId]/page.tsx`

- [ ] **Step 1: Receipt block** — when `order.status === "COMPLETED"`, render above the status steps a receipt card: store name, each item (`qty× name … lineTotal` via `formatPrice`), subtotal/SST/total rows, queue number, `createdAt` formatted, and a "Print receipt" button calling `window.print()`. Add a `@media print` style block (in the page or globals.css) hiding nav/buttons so printing yields a clean receipt.
- [ ] **Step 2: PWA nudge** — on the same page, a dismissible banner (state in `localStorage` key `queless-pwa-nudge-dismissed`): "Add QueLess to your home screen for one-tap ordering." shown only when `window.matchMedia('(display-mode: browser)').matches` and not previously dismissed. Listen for `beforeinstallprompt`, stash the event, and if present render an "Install" button that calls `event.prompt()`; otherwise the banner is informational with a dismiss ×.
- [ ] **Step 3: Verify** — local: complete an order via the dashboard (Accept → …→ Completed with seed merchant), reload tracking page → receipt renders, print preview is clean; banner appears once, dismiss persists across reload.
- [ ] **Step 4: Checks + commit** — `feat: completed-order receipt view and PWA install nudge`

---

### Task 5: Landing page mobile navigation

**Files:**
- Modify: `src/app/page.tsx` (nav at ~line 13–28: links live in a `hidden md:flex` container — 375px users have NO path to Sign In)

- [ ] **Step 1:** The landing page is a server component — add a small client component `src/app/MobileNav.tsx` ("use client"): hamburger button (`md:hidden`, `aria-label="Open menu"`, 44px touch target) toggling a full-width dropdown panel under the navbar with the same four links (Features, Pricing, Sign In, Start Free Trial); closes on link tap. Import and render it in the navbar next to the existing `hidden md:flex` block.
- [ ] **Step 2: Verify** — browse at 375×812: hamburger visible, opens, Sign In navigates to /login; at 1280 the hamburger is hidden and desktop nav unchanged. Screenshot both.
- [ ] **Step 3: Checks + commit** — `feat: mobile navigation for the landing page`
