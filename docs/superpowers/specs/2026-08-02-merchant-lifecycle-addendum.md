# Merchant Lifecycle Addendum — Freeze / Suspend / Early-bird polish

**Date:** 2026-08-02 (evening) · Extends `2026-08-02-live-eta-and-closed-trial-design.md`
**Status:** Approved by Muaz (chat), building immediately.

## Freeze — limited free mode (manual admin toggle)

New `User.frozenAt DateTime?`. Storefront STAYS LIVE but degraded:

- **Menu limit 1:** only the merchant's FIRST available menu item is orderable on the public store page; every other item renders as unavailable with label "Unavailable at the moment". Server-enforced at order creation too: an order containing any item other than the allowed one is rejected.
- **Order cap 5 ACTIVE at a time:** when the store already has 5 orders in statuses PAID/ACCEPTED/PREPARING/READY (confirmed kitchen work only — unconfirmed orders are excluded so throwaway checkouts can't jam the store; review finding H1), new checkout is rejected with a friendly "store is at capacity — please try again shortly" (code `FROZEN_CAPACITY`). Capacity frees as orders complete/cancel.
- **Analytics disabled:** `/api/dashboard/analytics` returns 403 (code `FROZEN`) and the Analytics nav item is greyed/locked with a lock hint; the page shows "Analytics is available on a paid plan".
- Merchant dashboard shows a persistent amber banner: "Your trial has ended — you're on limited mode. Contact us to activate your plan."
- Freeze/Unfreeze is instant and reversible; audit-logged (`ADMIN_MERCHANT_FREEZE` / `ADMIN_MERCHANT_UNFREEZE`).

## Suspend — immediate lockout + 7-day auto-purge

Reworks the existing Suspend semantics. New `Store.suspendedAt DateTime?` stamped when status → SUSPENDED, cleared on reactivate.

- Storefront hidden (existing behavior) AND merchant locked out of the dashboard immediately — full-screen "Account suspended" notice (mirrors PendingApproval styling, with Sign Out).
- Admin row shows countdown "deletes in Xd" and a **Restore** button (sets ACTIVE, clears suspendedAt).
- **Auto-sweep:** on each `/api/admin/merchants` GET, permanently delete every MERCHANT whose store's `suspendedAt` is older than 7 days — cascade order: notifications → order_items → orders → menu_items → categories → daily_queue_counters → store → user, in one transaction; audit-logged `ADMIN_MERCHANT_PURGE` per deletion. No cron required.

## Admin row polish

- Early bird button renders SOLID GREEN when on (toggle at approval time or later).
- Row actions: Approve (pending only) · Early bird · Freeze/Unfreeze · Suspend/Restore(+countdown).
- `/api/admin/merchants` GET additionally returns `frozenAt`, `suspendedAt`.
- `/api/account` GET additionally returns `frozenAt` (drives dashboard banner + nav lock).

## Out of scope

Payment collection itself; auto-freeze at trial expiry (freeze stays manual); customer notification of frozen stores; admin UI for purge history (audit log only). Two-account admin/merchant cookie clash: known browser-session behavior, not addressed here.
