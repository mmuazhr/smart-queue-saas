"use client";

// =============================================================================
// Login Page - Fixed with Suspense for CSR Bailout
// =============================================================================

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password. Please try again.");
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h2 className="mb-6 text-xl font-semibold text-[var(--color-text)]">
        Sign in to your account
      </h2>

      {error && (
        <div
          id="login-error"
          className="mb-4 rounded-lg px-4 py-3 text-sm"
          style={{
            background: "var(--color-error-bg)",
            color: "var(--color-error)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="login-email"
            className="mb-1.5 block text-sm font-medium text-[var(--color-text-secondary)]"
          >
            Email
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-lg border px-4 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2"
            style={{
              background: "var(--color-bg-secondary)",
              borderColor: "var(--color-border)",
              color: "var(--color-text)",
            }}
          />
        </div>

        <div>
          <label
            htmlFor="login-password"
            className="mb-1.5 block text-sm font-medium text-[var(--color-text-secondary)]"
          >
            Password
          </label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full rounded-lg border px-4 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2"
            style={{
              background: "var(--color-bg-secondary)",
              borderColor: "var(--color-border)",
              color: "var(--color-text)",
            }}
          />
        </div>

        <button
          id="login-submit"
          type="submit"
          disabled={loading}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed gradient-primary"
          style={{ boxShadow: "var(--shadow-glow)" }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Signing in...
            </span>
          ) : (
            "Sign In"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-medium transition-colors hover:underline"
          style={{ color: "var(--color-primary)" }}
        >
          Register as Merchant
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex animate-pulse items-center justify-center p-8">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
