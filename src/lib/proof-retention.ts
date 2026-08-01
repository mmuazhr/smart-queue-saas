// =============================================================================
// Payment-proof retention sweep
// =============================================================================
// Customer payment-proof screenshots (bank-app screenshots, privacy-sensitive)
// are retained for 48 hours after upload, then deleted. sweepExpiredProofs runs
// two independent, idempotent passes:
//   1. DB: clear Order.paymentProofUrl for orders old enough that any proof is
//      past retention (createdAt is a sound proxy for upload time).
//   2. Storage: delete every file object in the payment-proofs bucket older
//      than 48h. This also reaps orphans left by lost upload races.
// The DB pass runs first so a row cleared in this run has its object reaped
// in the same run's storage pass. Every failure is logged and swallowed --
// this function must never throw or reject.

import { logger } from "./logger";
import { prisma } from "./prisma";
import { listPaymentProofEntries, removePaymentProofs, type ProofStorageEntry } from "./storage";

export const PROOF_RETENTION_MS = 48 * 60 * 60 * 1000;

const DELETE_BATCH_SIZE = 100;

/** Instant 48h before `now`. Anything created strictly before this is expired. */
export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - PROOF_RETENTION_MS);
}

/**
 * Whether a Supabase Storage list() entry is an expired FILE object.
 * Folder entries (id === null) and entries missing a timestamp are never
 * treated as expired -- exactly 48h old is not yet expired (`<` cutoff).
 */
export function isExpiredFileEntry(entry: Pick<ProofStorageEntry, "id" | "created_at">, cutoff: Date): boolean {
  if (entry.id === null || !entry.created_at) return false;
  return new Date(entry.created_at).getTime() < cutoff.getTime();
}

/** Pure: given one folder's listing, returns the storage keys of its expired files. */
export function collectExpiredKeys(folder: string, entries: ProofStorageEntry[], cutoff: Date): string[] {
  return entries.filter((entry) => isExpiredFileEntry(entry, cutoff)).map((entry) => `${folder}/${entry.name}`);
}

async function sweepDbColumn(cutoff: Date): Promise<number> {
  try {
    const result = await prisma.order.updateMany({
      where: { paymentProofUrl: { not: null }, createdAt: { lt: cutoff } },
      data: { paymentProofUrl: null },
    });
    return result.count;
  } catch (error) {
    logger.error("[proof-retention] failed to clear expired paymentProofUrl rows", error);
    return 0;
  }
}

async function listExpiredStorageKeys(cutoff: Date): Promise<string[]> {
  let topLevel: ProofStorageEntry[];
  try {
    topLevel = await listPaymentProofEntries("");
  } catch (error) {
    logger.error("[proof-retention] failed to list payment-proofs bucket root", error);
    return [];
  }

  const keys: string[] = [];
  for (const entry of topLevel) {
    if (entry.id !== null) {
      // Stray root-level file (unexpected given the <folder>/<uuid>.<ext> key
      // layout, but handle it rather than skip it silently).
      if (isExpiredFileEntry(entry, cutoff)) keys.push(entry.name);
      continue;
    }

    try {
      const files = await listPaymentProofEntries(entry.name);
      keys.push(...collectExpiredKeys(entry.name, files, cutoff));
    } catch (error) {
      logger.error(`[proof-retention] failed to list payment-proofs folder "${entry.name}"`, error);
    }
  }
  return keys;
}

async function deleteStorageKeys(keys: string[]): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
    const chunk = keys.slice(i, i + DELETE_BATCH_SIZE);
    try {
      deleted += await removePaymentProofs(chunk);
    } catch (error) {
      logger.error("[proof-retention] failed to delete a batch of storage objects", error);
    }
  }
  return deleted;
}

export async function sweepExpiredProofs(now: Date = new Date()): Promise<{ dbCleared: number; objectsDeleted: number }> {
  const cutoff = retentionCutoff(now);

  const dbCleared = await sweepDbColumn(cutoff);

  let objectsDeleted = 0;
  try {
    const expiredKeys = await listExpiredStorageKeys(cutoff);
    objectsDeleted = await deleteStorageKeys(expiredKeys);
  } catch (error) {
    logger.error("[proof-retention] storage sweep pass failed", error);
  }

  return { dbCleared, objectsDeleted };
}
