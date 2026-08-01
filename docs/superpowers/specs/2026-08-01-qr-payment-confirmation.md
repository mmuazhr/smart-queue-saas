# Spec — Merchant QR Payment with Manual Confirmation

**Date:** 2026-08-01
**Replaces:** Stripe + Billplz automated gateway payment
**Driver:** Removes the settlement blocker (money never touches the platform account) and unblocks the pilot.

---

## Decisions locked

| # | Decision | Consequence |
|---|---|---|
| 1 | Queue number issued **only after the merchant confirms payment** | New order state before `PAID`; customer waits on a live confirmation screen |
| 2 | Customer **must upload a payment screenshot** | Requires the upload backend (Supabase Storage), currently stubbed |
| 3 | Stripe and Billplz code **deleted entirely**, not flagged off | Smaller surface; full rebuild if gateways return to roadmap |
| 4 | Closed store: **menu visible, ordering disabled** | Handled in a separate parallel change |
| 5 | **Cash follows the same confirmation flow as QR** | One code path, one Unconfirmed column; no divergent state machine |
| 6 | Tax becomes a **merchant-configurable charge list** (label + own %) | Replaces the hardcoded 6% SST entirely |

---

## Why this removes the settlement blocker

Customer funds move directly from the customer's bank to the **merchant's own DuitNow QR**. The platform never receives, holds, or pays out money. This eliminates the regulated money-intermediation posture identified as blocker #1 in `docs/BUSINESS_MODEL.md`, with no licensing question and no payout engine to build.

The tradeoff is deliberate: the merchant does manual reconciliation against their own bank account. At pilot scale that is acceptable, and it is how most small Malaysian F&B already operates.

---

## Order lifecycle

```
Customer submits order
   ↓  status = AWAITING_CONFIRMATION, queueNumber = null
Customer sees: merchant's QR image + exact total
   ↓  pays in their banking app
Customer uploads payment screenshot
   ↓  paymentProofUrl set
Merchant board: order appears in "Unconfirmed" column with proof thumbnail
   ↓  merchant verifies against own bank account
Merchant taps Confirm
   ↓  TRANSACTION: assign queueNumber, status = PAID, confirmedAt = now
Customer screen updates live via SSE: "Queue #12"
   ↓
ACCEPTED → PREPARING → READY → COMPLETED
```

Rejection path: merchant taps Reject at the unconfirmed stage → `CANCELLED`, no queue number ever issued.

**Critical detail:** the merchant's new-order audio alert currently fires on `PAID`. It must move to `AWAITING_CONFIRMATION`, otherwise the merchant is never alerted to the orders that need their action, and every customer sits waiting.

---

## Schema changes

**Store**
- `paymentQrUrl String?` — merchant's uploaded official DuitNow QR image
- `paymentInstructions String?` — optional free text shown under the QR (e.g. account name to check against)
- `charges Json?` — ordered list of merchant-configured charges, replacing the hardcoded 6% SST. Each entry: `{ label: string, rate: number, enabled: boolean }`. Defaults to empty, so **no tax is applied unless the merchant adds one**. Closes readiness blocker #2.

### Charges — design

The old behaviour (`subtotalCents * 0.06`, unconditional) is removed outright. Merchants configure their own lines in settings: `SST 6%`, `Service charge 10%`, both, or neither.

**DECIDED 2026-08-01: charges apply flat on the subtotal.** Each charge line is `rate% × subtotal`, independently — `Service charge 10%` + `SST 6%` on RM 100 = RM 10.00 + RM 6.00 = RM 116.00. No compounding on the running total.

Keep the existing half-up cent rounding per line to avoid float drift, and store the resolved breakdown on the order so a historical receipt never changes when the merchant later edits their rates. The existing `Order.tax` column holds the total of all charge lines; add `Order.chargeBreakdown Json?` for the itemised lines.

**Order**
- `paymentProofUrl String?` — customer's uploaded receipt screenshot
- `confirmedAt DateTime?` — when the merchant confirmed payment
- Status enum gains `AWAITING_CONFIRMATION`

**Deprecated but retained** (dropping columns mid-pilot risks live data for no benefit; remove in a later migration):
`Order.paymentIntentId`, `Order.paymentGateway`, `Store.paymentGateway`, `Store.gatewayMerchantId`

---

## API changes

| Endpoint | Change |
|---|---|
| `POST /api/upload` | **Implement** — currently a stub with no backend. **Supabase Storage-backed** (decided 2026-08-01: hosting-independent, works on Cloudflare and Railway alike; replaces the earlier R2 choice). Serves three uses: merchant QR, payment proof, menu images. |
| `POST /api/orders` | Remove all gateway branching. Always creates `AWAITING_CONFIRMATION` with **no** queue number. |
| `PATCH /api/orders/[orderId]/proof` | **New, public** — customer attaches their payment screenshot. |
| `PATCH /api/orders/[orderId]` | Merchant confirm. Transition `AWAITING_CONFIRMATION → PAID` assigns the queue number inside the existing transaction. |
| `POST /api/webhooks/[provider]` | **Delete** |

### Security — the proof upload endpoint is the exposed surface

The customer is unauthenticated, so this endpoint is reachable by anyone who knows an order ID. It must:

- Accept only an order in `AWAITING_CONFIRMATION` that has **no** proof attached yet (single write, no overwrite)
- Validate content type and magic bytes — images only, never trust the declared MIME type
- Enforce a hard size cap (~5 MB)
- Rate-limited: the in-memory limiter works on Railway (single long-lived process); keep a Cloudflare WAF rule in front as a second layer
- Store to Supabase Storage under an unguessable key in a **private bucket** (payment proofs are financial data — serve via short-lived signed URLs, never public); never echo a caller-supplied filename into the path

Without these it is an open file-upload endpoint attached to your storage bucket.

---

## Files to delete

```
src/lib/payments/stripe.ts
src/lib/payments/billplz.ts
src/lib/payments/service.ts
src/app/api/webhooks/[provider]/route.ts
+ associated tests (including the Billplz signature-string test)
```

Environment variables retired: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BILLPLZ_API_KEY`, `BILLPLZ_COLLECTION_ID`, `BILLPLZ_X_SIGNATURE_KEY`.

---

## UI changes

**Merchant settings** — upload the store's official QR image, optional payment instructions text, SST toggle (default off).

**Customer checkout** — payment method selection collapses to QR (and cash, pending the open question). Show the merchant's QR large enough to scan from another device, the exact total to transfer, and an upload control for the receipt screenshot.

**Customer order status** — a distinct pre-queue state: "Waiting for the shop to confirm your payment." No queue number shown yet. The existing SSE stream drives the transition to "Queue #12" with no refresh.

**Merchant Kanban** — a new leading "Unconfirmed" column (amber) with proof thumbnails, Confirm and Reject actions. The audio alert moves here.

---

## Known risk

Decision 1 means **the customer is blocked until the merchant acts**. A merchant mid-rush who ignores the tablet leaves customers staring at a waiting screen with no queue number and no recourse.

**DECIDED 2026-08-01 — two mitigations are v1 scope, not follow-ups:**
1. Unconfirmed-order **age badge** on the Kanban card (elapsed time since submission, turns red past ~3 minutes)
2. **Repeating audio alert** while any unconfirmed order exists (not a single chime on arrival)

Deferred to post-pilot: customer-facing "the shop is busy, please see the counter" fallback after a timeout.

---

## Open questions

None — all decisions locked as of 2026-08-01. Deployment target is Railway (see the implementation plan).

---

## Sequence

1. Upload backend (Supabase Storage) — **blocks everything else**
2. Schema migration
3. Order API rework + merchant confirm endpoint
4. Delete gateway code
5. Merchant settings QR upload + SST toggle
6. Customer checkout QR + proof upload
7. Merchant Kanban unconfirmed column + alert relocation
8. Customer order-status waiting state
