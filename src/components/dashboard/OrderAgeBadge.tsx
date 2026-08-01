"use client";

// =============================================================================
// OrderAgeBadge — elapsed mm:ss since an order was created, red past DANGER_MS
// =============================================================================

import { useEffect, useState } from "react";

export const DANGER_MS = 3 * 60 * 1000; // red past 3 minutes — pilot-tunable

export interface AgeInfo {
  label: string; // "m:ss"
  danger: boolean;
}

// Pure so it can be unit-tested without mounting the component (this repo's
// vitest environment is "node", no DOM/testing-library) — mirrors the
// openingLabel/ClosedBanner split.
export function formatAge(elapsedMs: number, dangerMs: number = DANGER_MS): AgeInfo {
  const elapsed = Math.max(0, elapsedMs);
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  return {
    label: `${mins}:${String(secs).padStart(2, "0")}`,
    danger: elapsed > dangerMs,
  };
}

export function OrderAgeBadge({ createdAt }: { createdAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const { label, danger } = formatAge(now - new Date(createdAt).getTime());

  return (
    <span
      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
        danger ? "bg-red-500/15 text-red-500 animate-pulse" : "bg-[var(--color-border)] text-[var(--color-text-muted)]"
      }`}
    >
      {label}
    </span>
  );
}
