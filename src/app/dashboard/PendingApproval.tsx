"use client";

// =============================================================================
// Pending Approval — friendly hold screen for unapproved merchants
// =============================================================================

import { signOut } from "next-auth/react";
import { Clock } from "lucide-react";

export default function PendingApproval() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div className="glass max-w-md rounded-3xl p-10 space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary">
          <Clock className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-2xl font-black tracking-tight">We&apos;re reviewing your registration</h1>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          Thanks for signing up for the QueLess closed trial! We personally review
          every new merchant — you&apos;ll hear from us shortly, usually within a day.
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">
          Questions? Reply to the message we sent you, or just check back soon.
        </p>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="rounded-xl border px-6 py-3 text-sm font-bold transition-colors hover:bg-[var(--color-bg-tertiary)]"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
