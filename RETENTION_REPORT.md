# 48-Hour Payment-Proof Retention Sweep

## Summary

Added a background sweep that clears `Order.paymentProofUrl` and deletes the
underlying Supabase Storage object once a payment-proof screenshot is more
than 48 hours old. Previously nothing ever deleted these (bank-app
screenshots, privacy-sensitive).

## Files changed

- `src/lib/storage.ts` — added `ProofStorageEntry`, `listPaymentProofEntries(prefix)`,
  `removePaymentProofs(keys)`. Follows the existing per-call `client()` /
  throw-on-error pattern used by `uploadPaymentProof` etc. No existing exports
  changed.
- `src/lib/proof-retention.ts` (new) — the sweep itself:
  - `PROOF_RETENTION_MS = 48 * 60 * 60 * 1000`
  - `retentionCutoff(now)` — pure, `now - 48h`
  - `isExpiredFileEntry(entry, cutoff)` — pure predicate; folders (`id === null`)
    and entries without `created_at` are never expired; comparison is strict
    `<` cutoff (exactly-48h-old is NOT expired yet)
  - `collectExpiredKeys(folder, entries, cutoff)` — pure; turns one folder's
    `list()` result into expired storage keys
  - `sweepExpiredProofs(now = new Date())` — orchestrates:
    1. DB pass: `prisma.order.updateMany({ where: { paymentProofUrl: { not: null }, createdAt: { lt: cutoff } }, data: { paymentProofUrl: null } })`
    2. Storage pass: walks the bucket two levels deep (root → folder → files,
       matching the `<folder>/<uuid>.<ext>` key layout), deletes expired files
       in batches of 100 via `removePaymentProofs`
    - DB pass runs first, per spec, so a row cleared this run has its object
      reaped as an orphan in the same run's storage pass.
    - Every failure (DB query, bucket/folder list, delete batch) is caught
      and logged via `logger.error`, never thrown. The function always
      resolves with `{ dbCleared, objectsDeleted }`.
- `src/lib/proof-retention.test.ts` (new) — 9 tests, all pure-logic, no live
  Supabase/Prisma: `PROOF_RETENTION_MS` value, `retentionCutoff` arithmetic,
  the `isExpiredFileEntry` boundary (pinned: exactly-48h = not expired,
  48h-1ms = expired, folder entries and null-timestamp entries never
  expired), and `collectExpiredKeys` end-to-end on a small fixture list.
- `src/instrumentation.ts` — inside the existing `NEXT_RUNTIME === "nodejs"`
  guard (same guard Sentry's server config already uses), dynamically
  imports `sweepExpiredProofs` and `logger`, then:
  - `setTimeout(runSweep, 5 min)` for the first run (avoids competing with
    cold start)
  - `setInterval(runSweep, 60 min)` thereafter
  - `runSweep` wraps the call in `.catch(...)` so a rejection can never
    become an unhandled rejection (belt-and-suspenders — `sweepExpiredProofs`
    itself already catches everything internally and never throws)
  - No cron endpoint or new service added; single-replica deployment is the
    documented invariant that makes the in-process interval correct.

## Gates

| Gate | Result |
|---|---|
| `npm test` | 107/107 passed (10 files), including the 9 new tests |
| `npx tsc --noEmit` | clean, no output |
| `npm run lint` | 15 errors / 26 warnings — all pre-existing, verified byte-identical on base commit `3b73ca6` via `git stash`; zero errors/warnings in any file this task touched (`storage.ts`, `proof-retention.ts`, `proof-retention.test.ts`, `instrumentation.ts`) |
| `npm run build` | succeeded, all routes compiled |

## Concerns / notes for review

- **`createdAt` as upload-time proxy**: per spec, `Order.createdAt` is used
  as the DB-pass cutoff rather than a dedicated proof-upload timestamp (none
  exists on the schema, and adding one was explicitly out of scope — "this
  task needs NO schema change"). This means the DB pass may retain a proof
  slightly *longer* than 48h from actual upload (proof is uploaded minutes
  after order creation), never shorter. The storage pass is authoritative for
  actual deletion timing since it uses the real object `created_at`.
- **Stray root-level files**: the bucket's documented key layout is
  `<folder>/<uuid>.<ext>`, so `list()` on the bucket root should only return
  folder entries (`id === null`). I defensively handle the case where a file
  object exists directly at bucket root (`id !== null`) by treating it as a
  candidate for deletion too, so it isn't silently skipped forever.
- **No schema change**: confirmed — nothing in `prisma/schema.prisma` was
  touched, and no `prisma migrate`/`generate` command was run.
- **Batch size**: capped at 100 keys per `.remove()` call per the pilot-scale
  guidance; not built to be a generic paginated/recursive walker beyond the
  documented two-level (folder/file) structure.
