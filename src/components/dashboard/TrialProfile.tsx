"use client";

// =============================================================================
// Trial Profile — sidebar avatar wrapped in a 7-day trial progress ring,
// with the merchant's name and tier badge underneath.
// =============================================================================

import { useEffect, useState } from "react";
import { trialStatus } from "@/lib/trial";

const RING_SIZE = 56;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const TONE_COLORS = {
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
} as const;

interface AccountData {
  name: string;
  avatarUrl: string | null;
  trialEndsAt: string | null;
}

export default function TrialProfile() {
  const [account, setAccount] = useState<AccountData | null>(null);

  useEffect(() => {
    fetch("/api/account")
      .then((r) => r.json())
      .then((res) => {
        if (res?.success && res.data) {
          setAccount({
            name: res.data.name ?? "",
            avatarUrl: res.data.avatarUrl ?? null,
            trialEndsAt: res.data.trialEndsAt ?? null,
          });
        }
      })
      .catch(() => {
        // sidebar block is decorative — fail silently
      });
  }, []);

  if (!account) return null;

  const trial = trialStatus(
    account.trialEndsAt ? new Date(account.trialEndsAt) : null,
    new Date()
  );
  const tone = trial ? TONE_COLORS[trial.tone] : null;
  const initial = (account.name || "?").charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-3 px-2">
      <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
        {trial && tone && (
          <svg
            width={RING_SIZE}
            height={RING_SIZE}
            className="absolute inset-0 -rotate-90"
            aria-hidden
          >
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth={RING_STROKE}
            />
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={tone}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - trial.fraction)}
            />
          </svg>
        )}
        <div
          className="absolute overflow-hidden rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center font-black text-[var(--color-text-muted)]"
          style={{ inset: RING_STROKE + 2 }}
        >
          {account.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.avatarUrl} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </div>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold" style={{ color: "var(--color-text)" }}>
          {account.name}
        </p>
        {trial && (
          <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: tone ?? "var(--color-text-muted)" }}>
            {trial.ended ? "Trial ended" : `Free Trial · ${trial.daysLeft}d left`}
          </p>
        )}
      </div>
    </div>
  );
}
