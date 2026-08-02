// =============================================================================
// Trial math — pure helpers for the sidebar trial ring and badge.
// =============================================================================

export const TRIAL_LENGTH_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TrialStatus {
  daysLeft: number;
  fraction: number; // 1 = full ring, 0 = empty
  tone: "green" | "amber" | "red";
  ended: boolean;
}

export function trialStatus(trialEndsAt: Date | null, now: Date): TrialStatus | null {
  if (!trialEndsAt) return null;
  const msLeft = trialEndsAt.getTime() - now.getTime();
  if (msLeft <= 0) return { daysLeft: 0, fraction: 0, tone: "red", ended: true };
  const daysLeft = Math.ceil(msLeft / DAY_MS);
  const fraction = Math.min(1, msLeft / (TRIAL_LENGTH_DAYS * DAY_MS));
  const tone = daysLeft <= 1 ? "red" : daysLeft <= 3 ? "amber" : "green";
  return { daysLeft, fraction, tone, ended: false };
}
