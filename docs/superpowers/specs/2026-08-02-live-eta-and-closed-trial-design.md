# Live ETA + Closed Trial — Design Spec

**Date:** 2026-08-02
**Status:** Approved design, pending implementation plan

## Overview

Two workstreams shipping together for the closed 7-day trial (5–10 hand-picked merchants):

1. **Live estimated wait time** for customers, computed from concurrent orders and the merchant's measured handling speed, with delay detection, friendly delay messages, and merchant manual time bumps.
2. **Closed-trial operations**: manual merchant approval via the existing admin dashboard (replaces automated email verification), a sidebar profile block with a 7-day trial progress ring and tier badge, and trial-mode pricing on the landing page with the early-bird hook.

Explicitly dropped from earlier drafts: invite codes, Resend/email verification, any billing/Stripe work.

---

## Feature 1: Live ETA

### 1.1 Calculation model (throughput-based)

New server-side module `src/lib/eta.ts`. Per-store rolling stats from timestamps already recorded on `Order`:

- **Throughput** = orders marked READY per minute over the trailing 60 minutes. Requires ≥ 3 READY samples in the window; otherwise fall back (below).
- **Avg prep minutes** = rolling average of `readyAt − acceptedAt` (use `paidAt` when `acceptedAt` is null) over the same window.
- **ETA for an order** =
  `(active orders ahead in queue ÷ throughput) + avgPrepMins + order.etaAdjustMins + store.queueDelayMins`
  - "Orders ahead" = active orders (`PAID`, `ACCEPTED`, `PREPARING`) with an earlier `confirmedAt`/`queueNumber`.
- **Cold-start fallback:** the legacy batch model `ceil(ordersAhead ÷ Store.maxConcurrentOrders) × Store.avgPrepTimeMins`, driven by the existing merchant-editable store settings (`avgPrepTimeMins` defaults to 10). These fields already exist and are already edited in Settings — no per-item fallback needed.
- **Caching:** store stats (throughput, avg prep) cached in memory for 30 s so the 3-second SSE tick stays cheap. Per-order ETA arithmetic runs every tick.

### 1.2 Schema changes (one migration)

```prisma
// Order — new fields
estimatedReadyAt DateTime? @map("estimated_ready_at") // absolute promised time
etaAdjustMins    Int       @default(0) @map("eta_adjust_mins")
delayReason      String?   @map("delay_reason")

// Store — new fields
queueDelayMins   Int       @default(0) @map("queue_delay_mins")
queueDelayReason String?   @map("queue_delay_reason")
```

- `estimatedReadyAt` is set when the merchant confirms the order (`AWAITING_CONFIRMATION → PAID`), from the model above. The existing `estimatedWaitMins` is set at the same moment (minutes form, record-keeping) — it is no longer dead.
- `estimatedReadyAt` is **the promise**. It only moves via the delay rule or a manual bump — never silently.

### 1.3 Delay detection

Evaluated server-side on each SSE tick for active orders:

- **Trigger A (stats drift):** recomputed remaining ETA exceeds the promise by more than `max(3 minutes, 20% of the original estimate)`.
- **Trigger B (manual):** merchant bumps the order (`etaAdjustMins`) or the store (`queueDelayMins`).
- On trigger: revise `estimatedReadyAt` once per trigger (no thrashing every tick), set `delayReason` if the merchant provided one, and stream `delayed: true`.
- A delayed order that recovers stays flagged — we never shorten a revised promise silently (under-promise, over-deliver).

### 1.4 SSE payload additions

`/api/queue/stream` payload gains per order: `etaMinutes` (remaining, clamped ≥ 0), `estimatedReadyAt`, `delayed`, `delayReason`.

### 1.5 Customer tracking page

- Shows **"Ready in ~X min"** counting down live from the streamed value.
- On `delayed: true`, a warm banner appears, matching existing app tone:
  > "Sorry for the wait! The kitchen's a little busy — your order should now be ready in ~X min 🙏"
  With the merchant's reason appended when present (e.g. "frying a fresh batch of chicken").
- No WhatsApp/SMS for delays — on-page only. The existing Twilio READY notification is unchanged.

### 1.6 Merchant dashboard (Live Queue)

- Each active order card shows its ETA; the card highlights **red/overdue** when `now > estimatedReadyAt`.
- Per-order controls: **+5 / +10 / +20 min** buttons with an optional quick reason (presets: "Frying a fresh batch", "Restocking an item", plus free text). Bumping updates the customer instantly.
- Queue header control: **"Delay all orders +X min"** with the same optional reason, and a **clear/back-to-normal** button that resets `queueDelayMins` to 0. Store-wide delay applies to active *and* new orders until cleared.
- New API: `PATCH /api/orders/[orderId]/eta` (per-order bump) and `PATCH /api/stores/[storeId]/queue-delay` (store-wide), both merchant-authenticated for the owning store.

### 1.7 Pre-order wait chip (menu page)

- Store menu page shows **"Current wait ~X min"** — same model: queue clearance + avg prep + store delay.
- Served by a light public endpoint (e.g. `GET /api/stores/[slug]/wait`), cacheable ~30 s. No customer auth required.

---

## Feature 2: Closed trial — manual merchant approval

### 2.1 Signup gate

- Public signup stays open and unchanged in fields.
- New merchants keep `isVerified: false` (existing field). The dashboard layout gates on it: unverified merchants see a friendly **"We're reviewing your registration — you'll hear from us shortly"** screen instead of the queue.

### 2.2 Admin approval (replaces automated email verification)

In the existing `/admin/merchants` list:

- Show each merchant's **email and phone** so the admin vets legitimacy manually.
- **Approve** button → sets `isVerified: true` and `trialEndsAt = now + 7 days`.
- **Early bird** toggle → sets `earlyBird: true` (flag only; honored when billing exists). Intended for the first 5 approved merchants (RM10/month off for 6 months post-trial).
- Both actions audit-logged like the existing suspend/reactivate actions.
- Trial expiry does **not** auto-lock anyone out; the admin uses the existing suspend action if needed.

### 2.3 Schema changes (same migration)

```prisma
// User — new fields
trialEndsAt DateTime? @map("trial_ends_at")
earlyBird   Boolean   @default(false) @map("early_bird")
avatarUrl   String?   @map("avatar_url")
```

---

## Feature 3: Sidebar profile block (trial ring + tier badge)

- New profile block in the dashboard sidebar footer, above the Theme toggle (`DashboardShell.tsx`):
  - **Avatar** (uploaded photo, or initials fallback) wrapped in an **SVG circular progress ring** representing the 7-day trial: full at day 0, depleting daily; green → amber (≤ 3 days) → red (last day).
  - Merchant name, and a tier badge: **"Free Trial · X days left"**; after expiry: **"Trial ended"**.
  - Ring and badge render only when `trialEndsAt` is set; approved-before-this-feature or post-trial-plan users simply show the avatar.
- **Avatar upload** on the Account page, reusing the existing Supabase upload route with a new kind `"avatar"` (same formats: jpg/png/webp).
- `/api/account` response gains `avatarUrl`, `trialEndsAt`, `earlyBird`; the dashboard shell fetches it once to render the block.

---

## Feature 4: Landing page trial mode

- Single env flag `NEXT_PUBLIC_TRIAL_MODE=true` (checked server-side too where relevant).
- When on, the pricing section's RM39 launch-offer card is replaced with a **closed-beta card**: "Closed beta — free 7-day trial, invite only", retaining the early-bird hook line: **"First 5 merchants get RM10/month off for 6 months."**
- Hero and other "7-day free trial" copy stays as-is. Flipping the flag off restores current behavior; no other code paths change.

---

## Out of scope (YAGNI)

- Billing, Stripe, plan enforcement of any kind.
- Automated email verification / email sending (Resend etc.).
- Invite codes and admin code management UI.
- WhatsApp/SMS delay notifications.
- Per-item workload ETA weighting and kitchen-capacity settings.
- Auto-lockout at trial expiry.

## Testing

- **Unit (eta lib):** throughput math, ≥3-sample requirement, cold-start fallback chain (item prep → 10 min), delay threshold `max(3 min, 20%)`, clamping, store-delay and per-order-adjust composition.
- **API:** bump endpoints (auth: only the owning merchant; validation: positive minutes, reason length), admin approve (sets both fields, audit log), queue-delay set/clear.
- **SSE:** payload includes the new fields; delayed flag appears on manual bump.
- **Existing suites must stay green.**

## Success criteria

1. Confirming an order stamps `estimatedWaitMins` + `estimatedReadyAt`; the customer page shows a live countdown.
2. With a seeded busy queue, a new order's ETA reflects queue depth ÷ measured throughput (verified by unit test with fixed timestamps).
3. Merchant taps "+20 min, frying fresh batch" → customer page shows the friendly delay banner with the reason within one SSE tick.
4. Unapproved merchant sees the pending screen; admin Approve unlocks the dashboard and starts the 7-day ring in the sidebar.
5. `NEXT_PUBLIC_TRIAL_MODE=true` hides the RM39 card and shows the closed-beta card with the early-bird line.
