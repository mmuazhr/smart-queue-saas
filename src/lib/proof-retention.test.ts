import { describe, it, expect } from "vitest";
import { PROOF_RETENTION_MS, retentionCutoff, isExpiredFileEntry, collectExpiredKeys } from "./proof-retention";
import type { ProofStorageEntry } from "./storage";

const now = new Date("2026-08-01T12:00:00Z");

const file = (overrides: Partial<ProofStorageEntry> = {}): ProofStorageEntry => ({
  name: "proof.jpg",
  id: "file-id",
  created_at: now.toISOString(),
  ...overrides,
});

describe("PROOF_RETENTION_MS", () => {
  it("is 48 hours in milliseconds", () => {
    expect(PROOF_RETENTION_MS).toBe(48 * 60 * 60 * 1000);
  });
});

describe("retentionCutoff", () => {
  it("is exactly 48 hours before now", () => {
    expect(retentionCutoff(now).getTime()).toBe(now.getTime() - PROOF_RETENTION_MS);
  });
});

describe("isExpiredFileEntry", () => {
  const cutoff = retentionCutoff(now);

  it("treats an entry created exactly at the cutoff as NOT yet expired (strict <)", () => {
    const entry = file({ created_at: cutoff.toISOString() });
    expect(isExpiredFileEntry(entry, cutoff)).toBe(false);
  });

  it("treats an entry created 1ms before the cutoff as expired", () => {
    const entry = file({ created_at: new Date(cutoff.getTime() - 1).toISOString() });
    expect(isExpiredFileEntry(entry, cutoff)).toBe(true);
  });

  it("treats an entry created after the cutoff as not expired", () => {
    const entry = file({ created_at: new Date(cutoff.getTime() + 1).toISOString() });
    expect(isExpiredFileEntry(entry, cutoff)).toBe(false);
  });

  it("never treats a folder entry (id null) as an expired file", () => {
    const oldFolder = file({ id: null, created_at: new Date(cutoff.getTime() - 1).toISOString() });
    expect(isExpiredFileEntry(oldFolder, cutoff)).toBe(false);
  });

  it("never treats an entry with no created_at as expired", () => {
    const entry = file({ created_at: null });
    expect(isExpiredFileEntry(entry, cutoff)).toBe(false);
  });
});

describe("collectExpiredKeys", () => {
  it("returns folder-prefixed keys for expired files only", () => {
    const cutoff = retentionCutoff(now);
    const entries: ProofStorageEntry[] = [
      file({ name: "old.jpg", created_at: new Date(cutoff.getTime() - 1).toISOString() }),
      file({ name: "fresh.jpg", created_at: new Date(cutoff.getTime() + 1).toISOString() }),
      { name: "subfolder", id: null, created_at: null },
    ];

    expect(collectExpiredKeys("order-abc", entries, cutoff)).toEqual(["order-abc/old.jpg"]);
  });

  it("returns an empty array when nothing is expired", () => {
    const cutoff = retentionCutoff(now);
    const entries: ProofStorageEntry[] = [file({ created_at: now.toISOString() })];
    expect(collectExpiredKeys("order-abc", entries, cutoff)).toEqual([]);
  });
});
