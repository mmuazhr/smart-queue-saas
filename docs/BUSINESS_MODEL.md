# QueLess — Production Readiness & Commercial Model

**Date:** 2026-08-01
**Context:** 1-week supervised pilot, then begin charging. 7-day free trial per merchant.
**Currency:** RM, at approximately USD 1 = RM 4.45. Verify FX and all vendor prices before publishing.

---

## Part 1 — Is the platform production ready?

### Verdict

**Yes for a supervised 1-week pilot — on the condition that payments run cash-only or through the merchant's own gateway account.**

**No for taking money from strangers on day 8** until the five blockers in the table below are closed.

This distinction matters. The product surface is genuinely good: the order lifecycle is complete and coherent, payment webhooks are idempotent, money is handled in `Decimal(10,2)` with half-up cent rounding rather than floats, queue-number assignment is transactional, and store suspension is enforced at *both* the storefront (`src/app/store/[slug]/page.tsx:52`) and order creation (`src/app/api/orders/route.ts:93`). That last one is worth more than it looks — see Part 4.

What is missing is not features. It is the operational and legal scaffolding that separates a working demo from a business that holds other people's money.

### Blockers, ranked

| # | Blocker | Why it blocks | Fix |
|---|---|---|---|
| 1 | **Payment settlement does not exist** | Customer payments land in **your** Stripe/Billplz account for food **the merchant** sells. You are intermediating funds with no payout mechanism. In Malaysia this is a regulated posture, not a backlog item. There is no settlement report, no payout job, no ledger. | The architecture already anticipates this: `Store.paymentGateway` and `Store.gatewayMerchantId` exist in the schema and are unused. Wire each merchant to their own Billplz collection so money never touches your account. This is the intended design — finish it. |
| 2 | **6% SST hardcoded on every order** | `src/app/api/orders/route.ts:150` applies `subtotalCents * 0.06` unconditionally. Malaysian service tax registration is threshold-based; most small merchants are **not** registered. Charging tax on behalf of an unregistered business, and remitting it nowhere, is a live legal exposure for you and for them. | Make it a per-store field, **default off**. Small change, large risk reduction. |
| 3 | **Rate limiting is a no-op in production** | `src/lib/rate-limit.ts` uses an in-memory `Map`. On Cloudflare Workers each isolate has its own memory and isolates are ephemeral and globally distributed, so the limiter resets constantly. Order creation and registration are effectively unlimited. Because each order can trigger SMS, this is a direct path to burning your Twilio balance, plus junk queue numbers on a live merchant's board. | Cloudflare WAF rate-limiting rules mitigate this **same day, with no code**. Do that before the pilot. Durable Objects or KV later. **RESOLVED 2026-08-01:** migrated to Railway (single long-lived Node process) — the in-memory limiter now functions. WAF prescription obsolete. |
| 4 | **No password reset flow** | There is no forgot-password route anywhere in `src/app`. A merchant who forgets their password is locked out and only you can rescue them with a manual DB write. At 5 merchants that is a phone call. At 50 it is your evenings. | Token-based email reset. Requires an email provider (none is integrated yet). |
| 5 | **Zero observability** | No Sentry, no error tracking, no structured logging, no alerting. When a merchant says "orders stopped coming through," you have no way to find out what happened. | Sentry free tier plus Cloudflare Workers Logs. An afternoon. |

### Secondary issues — not launch blockers, but schedule them

- **No email verification.** `User.isVerified` exists but is never enforced. At pilot scale, manual approval is better than building this.
- **Analytics recompute on every fetch** with no caching, and are hardcoded to today-vs-yesterday. Fine at 5 merchants; a cost and latency problem later.
- **No pagination** — order queries cap at 100, category and menu queries are unbounded.
- **No backups.** Supabase free tier has no point-in-time recovery. Pro does. This alone justifies the Pro upgrade.
- **One store per merchant**, enforced at schema level (`Store.ownerId @unique`). Correct for now, but it is the hard blocker on the Business tier.
- **File upload is stubbed.** `POST /api/upload` is referenced by settings but has no backend, so menu images cannot actually be uploaded.

### Honest summary

You have built roughly 80% of a product and about 20% of a business. The engineering that remains is small. The settlement question is the one that genuinely needs a decision from you before you charge anyone, and it is commercial rather than technical.

---

## Part 2 — Error 1102 will not go away by upgrading

You asked for pricing that guarantees no 1102. **That is not something you can buy**, and it is important you know why before you set prices around it.

### The mechanism

Your real-time layer is Server-Sent Events at `src/app/api/queue/stream/route.ts`, polling the database every 3000 ms (`setInterval(poll, 3000)`, line 98).

A streaming SSE response is **one Worker invocation** that stays open for the entire life of the connection. All CPU consumed by every poll accrues against **a single 30-second CPU budget**. The Workers Paid plan raises the per-invocation ceiling from 10 ms to 30 s — which is why upgrading appears to fix things — but it does not make the budget refresh.

The consequence: a merchant dashboard left open across a full trading shift performs thousands of polls on one invocation and will exhaust its budget and throw 1102 **mid-shift, on any plan**. This is the worst possible failure mode, because it hits the merchant during service.

### The fix is cheap

Bound the SSE handler's lifetime — close the stream after 60–90 seconds. The browser's `EventSource` reconnects automatically by default, and **each reconnect starts a fresh CPU budget**. Small diff, removes the ceiling entirely, no architectural rewrite.

Do this before the pilot. Then measure actual CPU-ms per poll from Workers analytics on the deployed app rather than trusting any estimate — including the ones in this document.

Longer term, if you outgrow that: Durable Objects give you real push semantics and remove the polling entirely.

### The upgrade is still required

Workers Paid is non-negotiable regardless — the free plan's 10 ms CPU ceiling cannot render a Next.js SSR route at all. Upgrade **and** bound the stream. One without the other does not get you to "no slowness, no 1102."

---

## Part 3 — What it actually costs to run

### Fixed monthly platform cost

| Item | USD | RM | Note |
|---|---|---|---|
| Railway Hobby | ~$5 base + usage | ~22 + usage | Realistically $5–15/mo all-in |
| Supabase Pro | $25 | 111 | Mandatory — free tier pauses on inactivity, 500 MB cap, no PITR backups |
| Domain | ~$1 | 5 | |
| R2 (menu images) | $0 | 0 | 10 GB free, zero egress fees |
| Sentry / monitoring | $0 | 0 | Free tier sufficient at this scale |
| **Total fixed** | **~$31** | **~RM 140** | Call it RM 150 with headroom |

### Variable cost per order

Compute cost is genuinely negligible. Two volume scenarios, both including SSE polling, SSR page loads, and merchant dashboards open 12 h/day:

| Scenario | Orders/month | Est. CPU-ms/month | Cloudflare total |
|---|---|---|---|
| **A — Realistic pilot** (5 merchants × ~120 orders/day) | ~18,000 | ~38 M | **~$5** (barely over the 30 M included) |
| **B — Your stated ceiling** (5 merchants × 1000 orders/day) | ~150,000 | ~223 M | **~$9** |

Overage is $0.02 per million CPU-ms and $0.30 per million requests. Note that SSE counts as **one request per connection**, not per poll, so request volume stays far under the 10 M included allowance in both scenarios.

**Marginal infrastructure cost is roughly RM 0.01 per order.** Cloudflare is not where your money goes. These CPU figures rest on estimated per-poll cost — measure before relying on them, though the conclusion is robust to being wrong by 5×.

### The two costs that actually matter

**1. SMS destroys the unit economics if bundled.**

Twilio sends two messages per order (confirmation, then ready). Let `r` = your cost per message in RM. Break-even order volume on an RM 59/month plan is `59 / 2r`:

| Cost per SMS | Orders/month before the plan loses money | Per day |
|---|---|---|
| RM 0.10 | 295 | ~10 |
| RM 0.20 | 148 | ~5 |
| RM 0.35 | 84 | ~3 |

At **any** realistic Malaysian SMS rate, a stall doing ten orders a day wipes out an RM 59 subscription. This holds regardless of what Twilio's exact rate turns out to be — verify it on your console, but do not bundle SMS at any price.

**The resolution:** default customer notification to the **on-screen order tracker** (already built, SSE-based, free) plus **PWA web push** (the install nudge already exists; push itself is unimplemented but free to run). Sell SMS and WhatsApp as **prepaid credit packs**, priced above verified cost. This turns your worst cost centre into a margin line.

**2. Payment gateway fees must never touch your P&L.**

Billplz FPX runs roughly RM 0.50–1.00 flat per transaction; Stripe is around 3% + RM 1 and is much worse for small basket sizes. At scenario B's 150,000 orders/month that is RM 75,000–150,000 monthly. This **must** be passed to the customer at checkout or borne by the merchant on their own gateway account — which is exactly what fixing Blocker #1 achieves. Merchant-owned gateways solve the regulatory problem and the cost problem in one change.

---

## Part 4 — You can start charging with zero new code

This is the most useful thing in this document.

Because store suspension is already enforced at both the storefront and the order API, **you do not need a subscription model, a feature-flag system, or trial-timer code to begin billing.** For the first cohort:

1. Merchant signs up, you approve manually.
2. Day 7: trial ends. You send a Billplz FPX bill by WhatsApp.
3. Paid → nothing happens, store keeps running.
4. Not paid → admin dashboard, set store to `SUSPENDED`. Storefront goes dark, order API rejects. Data is preserved, reactivation is one click.

That is a complete billing enforcement loop, today, with no engineering. It is manual, and at 5–50 merchants manual is *correct* — it also gives you a weekly conversation with every customer, which is worth more than automation while you are still learning what they want.

Two consequences worth internalising:

- **Skip phone-OTP anti-abuse.** It costs SMS money — the exact thing you are trying to eliminate — to solve a problem manual approval solves for free at this scale.
- **Billplz FPX is one-off, not recurring.** Real subscription billing needs Stripe cards or direct debit. Do not build it until manual invoicing actually hurts, which is somewhere north of 30 merchants.

---

## Part 5 — Pricing

### Strategic position

Do **not** charge a percentage of GMV. Your entire pitch against GrabFood and foodpanda is "keep 100% of your revenue." A commission, however small, hands that argument away. Flat SaaS, with usage-based add-ons only for things that cost you real money per unit (messaging).

Also **no order caps in v1**. Metering and overage need code you do not have, and with ~RM 0.01 marginal cost per order there is nothing to protect. Price on outlets and capability. Revisit when you have real volume data.

### The value argument

A merchant doing 1000 orders/day at RM 15 average = RM 450,000/month in sales. On Grab at ~30% commission that is **RM 135,000/month** surrendered. QueLess Business at RM 299 is **0.07%** of their revenue.

Even a small stall — 100 orders/day at RM 10 = RM 30,000/month — pays 0.2% on Starter.

The line to use in sales: **RM 59/month is RM 1.97 a day. Less than one burger.**

### Tiers

Each tier is split into what is **shippable today** versus what needs building. Only Starter is fully deliverable in week 2.

---

#### **Starter — RM 59/month** (RM 590/year, 2 months free)
**100% shippable today. This is your launch tier.**

- 1 outlet
- Unlimited menu items and categories
- QR code + branded storefront page
- Live queue Kanban dashboard with audio alert
- Order history, search and filter
- Cash payment + online payment via merchant's own Billplz/Stripe
- Today's analytics: revenue, order count, average order value, hourly chart, top 5 items
- Customer order tracker with live status
- Email support

*Target: single hawker stall, kopitiam, cafe, food truck.*

---

#### **Growth — RM 129/month** (RM 1,290/year)
**Needs ~2–3 weeks of build. Sell as a dated pre-commitment.**

Everything in Starter, plus:
- Staff accounts (up to 3) — *requires breaking the one-user-per-store constraint*
- Full analytics: custom date ranges, trends, CSV export
- Remove QueLess branding from storefront
- 100 SMS/WhatsApp notifications included monthly, then RM 0.30 each
- PWA web push notifications
- Priority WhatsApp support

*Target: busy cafe or restaurant with multiple staff on shift.*

---

#### **Business — RM 299/month** (RM 2,990/year)
**Needs ~4–6 weeks of build. Multi-outlet is the schema change.**

Everything in Growth, plus:
- Up to 5 outlets — *requires removing `Store.ownerId @unique`*
- Consolidated cross-outlet analytics
- Unlimited staff accounts
- 500 messages included monthly
- API access
- Dedicated onboarding and setup

*Target: small local chains.*

---

#### Add-on — Message credits
**RM 20 per 100 messages.** Price above verified Twilio cost. Available on all tiers. This is how SMS becomes profitable instead of fatal.

---

### Founding merchant offer

**RM 39/month, locked for 12 months, first 10 merchants only.**

Rewards your pilot cohort, creates genuine urgency, and still clears cost at four merchants. It also buys you something more valuable than the RM 20 discount: these ten people will tell you what to build next.

### Trial mechanics

- **7 days, no credit card.** Malaysian SMEs will not hand over card details before seeing value, and requiring one will crush signup volume at the stage where you most need learning.
- Manual approval on signup (fraud control, zero cost, gives you a conversation).
- Nudge on day 5 and day 7 — send these by hand.
- Trial ends → invoice → suspend on non-payment. Data preserved indefinitely; reactivation is instant.
- A Free tier is deliberately **not** offered in v1, because without metering code "free" just means "the whole product for nothing." Introduce it once order caps can actually be enforced.

---

## Part 6 — Financial model

### Break-even

| | |
|---|---|
| Fixed cost | RM 150/month |
| Break-even at Starter (RM 59) | **3 merchants** |
| Break-even at founding rate (RM 39) | **4 merchants** |

Infrastructure break-even is trivial. The real threshold is your own time — if you value support and sales at ~10 h/week, covering that needs roughly 30–35 paying merchants.

### 12-month projection

Assumptions: 40% trial-to-paid conversion (warm, hand-sold — this will not survive scaling to cold traffic), 5% monthly churn, tier mix from month 4 of 70% Starter / 25% Growth / 5% Business, blended ARPU ~RM 88.

| Month | Paying merchants | MRR (RM) | Infra cost (RM) | Net (RM) |
|---|---|---|---|---|
| 1 | 4 (founding) | 156 | 150 | 6 |
| 3 | 13 | ~700 | 150 | 550 |
| 6 | 30 | ~2,400 | 200 | 2,200 |
| 9 | 55 | ~4,600 | 300 | 4,300 |
| 12 | 85 | ~7,200 | 450 | **~6,750** |

**Month 12 run-rate: ~RM 86,000 ARR** before your own time is costed.

### Sensitivities

- **Churn is the dominant risk.** F&B SMEs close constantly. 5%/month compounds to ~46% annually. At 8%/month, month-12 merchants drop to roughly 60 and MRR to ~RM 5,100. Retention work beats acquisition work in this market.
- **Conversion at 40% is optimistic beyond the warm cohort.** Model 20% for cold inbound.
- **Supabase will need a compute upgrade** somewhere around 100+ active merchants — budget $75–100/month rather than $25. Still immaterial against MRR.
- The model assumes merchants use **their own** payment gateways. If you ever settle funds yourself, gateway fees and float become the dominant P&L line and the entire model changes.

---

## Part 7 — Recommended sequence

**Before the pilot (this week)**
1. Bound the SSE connection to 60–90 s — this is what buys "no 1102" (Part 2)
2. Upgrade to Railway Hobby + Supabase Pro
3. Add Cloudflare WAF rate-limiting rules — no code, closes Blocker #3
4. Make SST per-store, default off — Blocker #2
5. Add Sentry — Blocker #5
6. Run the pilot **cash-only or on merchant-owned gateways**, sidestepping Blocker #1

**Week 2 — start charging**
7. Manual Billplz invoices, admin-suspend on non-payment (Part 4)
8. Launch Starter at the RM 39 founding rate
9. Measure real CPU-ms per poll from Workers analytics; revisit the cost model

**Weeks 3–6 — remove the manual scaffolding**
10. Merchant-owned gateway wiring — closes Blocker #1 properly
11. Password reset + email provider — Blocker #4
12. PWA web push, replacing SMS as the default channel
13. Staff accounts + full analytics → unlocks Growth tier

**Months 2–3**
14. Multi-outlet (drop `ownerId @unique`) → unlocks Business tier
15. Recurring billing, once manual invoicing genuinely hurts
16. Order metering → enables a real Free tier

---

## Open questions for you

1. **Settlement:** are merchants bringing their own Billplz accounts, or do you intend to collect and pay out? This single answer determines your regulatory exposure and reshapes the financial model.
2. **Is 1000 orders/day/store an aspiration or a launch estimate?** It changes nothing about pricing, but a lot about how urgently the SSE and analytics work needs doing.
3. **Who are the 5 pilot merchants?** If they are friendly, the founding rate is the right instrument. If they are cold, expect to discount further and treat month 1 as research rather than revenue.
