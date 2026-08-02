"use client";

// =============================================================================
// Suspended Notice — full-screen lockout for suspended merchants
// =============================================================================

import { signOut } from "next-auth/react";
import { Ban } from "lucide-react";

export default function SuspendedNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div className="glass max-w-md rounded-3xl p-10 space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15">
          <Ban className="h-7 w-7 text-red-500" />
        </div>
        <h1 className="text-2xl font-black tracking-tight">Account suspended</h1>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          Your account is suspended and scheduled for deletion. Contact us if you
          think this is a mistake.
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
