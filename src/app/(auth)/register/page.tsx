"use client";

// =============================================================================
// Register Page — Merchant Registration
// =============================================================================

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear field error on change
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGlobalError("");
    setErrors({});
    setLoading(true);

    // Client-side validation
    const newErrors: Record<string, string> = {};
    if (form.name.length < 2) newErrors.name = "Name must be at least 2 characters";
    if (!form.email.includes("@")) newErrors.email = "Please enter a valid email";
    if (form.password.length < 8) newErrors.password = "Password must be at least 8 characters";
    if (form.password !== form.confirmPassword) newErrors.confirmPassword = "Passwords do not match";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.errors) {
          setErrors(data.errors);
        } else {
          setGlobalError(data.error || "Registration failed. Please try again.");
        }
        setLoading(false);
        return;
      }

      // Auto-login after successful registration
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (result?.error) {
        setGlobalError("Account created but login failed. Please sign in manually.");
        router.push("/login");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setGlobalError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border px-4 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2";
  const inputStyle = {
    background: "var(--color-bg-secondary)",
    borderColor: "var(--color-border)",
    color: "var(--color-text)",
  };

  return (
    <>
      <h2 className="mb-6 text-xl font-semibold text-[var(--color-text)]">
        Create a merchant account
      </h2>

      {globalError && (
        <div
          id="register-error"
          className="mb-4 rounded-lg px-4 py-3 text-sm"
          style={{
            background: "var(--color-error-bg)",
            color: "var(--color-error)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
          }}
        >
          {globalError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label
            htmlFor="register-name"
            className="mb-1.5 block text-sm font-medium text-[var(--color-text-secondary)]"
          >
            Full Name
          </label>
          <input
            id="register-name"
            type="text"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            required
            placeholder="Your full name"
            className={inputClass}
            style={inputStyle}
          />
          {errors.name && (
            <p className="mt-1 text-xs" style={{ color: "var(--color-error)" }}>
              {errors.name}
            </p>
          )}
        </div>

        {/* Email */}
        <div>
          <label
            htmlFor="register-email"
            className="mb-1.5 block text-sm font-medium text-[var(--color-text-secondary)]"
          >
            Email
          </label>
          <input
            id="register-email"
            type="email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
            className={inputClass}
            style={inputStyle}
          />
          {errors.email && (
            <p className="mt-1 text-xs" style={{ color: "var(--color-error)" }}>
              {errors.email}
            </p>
          )}
        </div>

        {/* Phone */}
        <div>
          <label
            htmlFor="register-phone"
            className="mb-1.5 block text-sm font-medium text-[var(--color-text-secondary)]"
          >
            Phone Number{" "}
            <span className="text-[var(--color-text-muted)]">(optional)</span>
          </label>
          <input
            id="register-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            placeholder="+60123456789"
            className={inputClass}
            style={inputStyle}
          />
          {errors.phone && (
            <p className="mt-1 text-xs" style={{ color: "var(--color-error)" }}>
              {errors.phone}
            </p>
          )}
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="register-password"
            className="mb-1.5 block text-sm font-medium text-[var(--color-text-secondary)]"
          >
            Password
          </label>
          <input
            id="register-password"
            type="password"
            value={form.password}
            onChange={(e) => updateField("password", e.target.value)}
            required
            autoComplete="new-password"
            placeholder="Minimum 8 characters"
            className={inputClass}
            style={inputStyle}
          />
          {errors.password && (
            <p className="mt-1 text-xs" style={{ color: "var(--color-error)" }}>
              {errors.password}
            </p>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label
            htmlFor="register-confirm-password"
            className="mb-1.5 block text-sm font-medium text-[var(--color-text-secondary)]"
          >
            Confirm Password
          </label>
          <input
            id="register-confirm-password"
            type="password"
            value={form.confirmPassword}
            onChange={(e) => updateField("confirmPassword", e.target.value)}
            required
            autoComplete="new-password"
            placeholder="Re-enter your password"
            className={inputClass}
            style={inputStyle}
          />
          {errors.confirmPassword && (
            <p className="mt-1 text-xs" style={{ color: "var(--color-error)" }}>
              {errors.confirmPassword}
            </p>
          )}
        </div>

        <button
          id="register-submit"
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
              Creating account...
            </span>
          ) : (
            "Create Account"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium transition-colors hover:underline"
          style={{ color: "var(--color-primary)" }}
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
