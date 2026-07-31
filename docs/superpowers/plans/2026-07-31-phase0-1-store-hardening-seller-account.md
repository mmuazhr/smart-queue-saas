# Phase 0+1: Create-Store Hardening + Seller Account Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop create-store double-submits/duplicates, and give merchants profile + password management.

**Architecture:** All server logic in existing Next.js App Router API routes (Node runtime on Cloudflare Workers via OpenNext); session identity always derived from `auth()` server-side, never from payloads. UI follows the dashboard's existing glass-card Tailwind idiom. Zod validation lives in `src/lib/validators.ts` with vitest coverage in `src/lib/validators.test.ts`.

**Tech Stack:** Next.js 16.2.12, NextAuth v5 (JWT), Prisma 6.19 + @prisma/adapter-pg, zod 4, bcryptjs, vitest.

## Global Constraints

- Run everything from `/Users/muazhusaini/Documents/Project/QueLess/smart-queue-saas`.
- Suite must never shrink: currently **40 passing** (`npm run test`), `npm run typecheck` clean, `npm run build` green before every commit.
- Commit format `<type>: <description>`, one commit per task, no attribution footers.
- Do NOT deploy (`npm run deploy:cf`) — the orchestrator deploys after review.
- API errors: JSON `{ success: false, error, code? }`; unauthenticated API calls already get 401 JSON from middleware — don't duplicate that.
- `prisma` is imported as `import prisma from "@/lib/prisma"` — never instantiate PrismaClient directly (Workers lifecycle is managed there).
- The local dev DB (Prisma Postgres, `npx prisma dev` must be running) is seeded with `merchant@test.my` / `merchant123` who owns store "Abang Burger". Dev server: `npm run dev` on :3000. Browser checks use `$HOME/.claude/skills/gstack/browse/dist/browse` (`goto`, `fill <sel> <val>`, `click <sel>`, `url`, `screenshot <path>`).

---

### Task 1: One-store-per-owner guard (server)

**Files:**
- Modify: `src/app/api/stores/route.ts` (POST handler, after the `parsed.success` check ~line 46)

**Interfaces:**
- Produces: POST `/api/stores` returns **409** `{ success: false, code: "STORE_EXISTS", error: "You already have a store.", data: <existing store> }` when the session user already owns a store. Task 2's client relies on `code === "STORE_EXISTS"` and `data`.

- [ ] **Step 1: Add the guard**

In the POST handler, immediately after validation succeeds and before `slugify`:

```ts
    // One store per merchant — the whole dashboard assumes stores[0].
    // A double-submit must not create a duplicate.
    const existingStore = await prisma.store.findFirst({
      where: { ownerId: session.user.id },
    });
    if (existingStore) {
      return NextResponse.json(
        {
          success: false,
          code: "STORE_EXISTS",
          error: "You already have a store.",
          data: existingStore,
        },
        { status: 409 }
      );
    }
```

- [ ] **Step 2: Verify against local dev**

With `npm run dev` running, log in via browse as `merchant@test.my` / `merchant123` (owns a store), then from the browser console context:

Run: `$B js "fetch('/api/stores',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Second Store'})}).then(r=>r.json()).then(j=>{window.__r=JSON.stringify({s:j.success,c:j.code})})"` then `$B js "window.__r"`
Expected: `{"s":false,"c":"STORE_EXISTS"}`

- [ ] **Step 3: Full checks**

Run: `npm run test && npm run typecheck`
Expected: 40 passing, typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/stores/route.ts
git commit -m "fix: one store per merchant — 409 STORE_EXISTS blocks duplicate creation"
```

---

### Task 2: Create-form pending state + error/409 handling (client)

**Files:**
- Modify: `src/app/dashboard/settings/page.tsx` (the `CreateStoreForm` component at the bottom of the file)

**Interfaces:**
- Consumes: Task 1's 409 `code: "STORE_EXISTS"`.

- [ ] **Step 1: Harden the submit handler**

In `CreateStoreForm`, ensure this exact behavior (adapt to the component's existing state names — it already has a submit handler that POSTs `/api/stores` and calls the parent's reload on success):

```tsx
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;               // double-click guard
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),    // existing payload construction
      });
      const data = await res.json();
      if (data.success || data.code === "STORE_EXISTS") {
        // STORE_EXISTS means an earlier submit already worked — treat as success
        await onCreated();                // existing parent reload callback
      } else {
        setFormError(data.error || "Could not create your store. Please try again.");
      }
    } catch {
      setFormError("Network problem — your store may not have been created. Reload the page to check before retrying.");
    } finally {
      setSubmitting(false);
    }
  }
```

The submit button must render disabled while pending:

```tsx
  <button type="submit" disabled={submitting}
    className="rounded-xl gradient-primary px-6 py-3 text-sm font-bold text-white disabled:opacity-60 disabled:cursor-not-allowed">
    {submitting ? "Creating…" : "Create Store"}
  </button>
```

And `formError` renders above the button:

```tsx
  {formError && (
    <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{formError}</p>
  )}
```

- [ ] **Step 2: Verify in the browser**

Fresh local account (register via UI), go to Settings, click Create Store rapidly several times with a valid name.
Expected: exactly ONE store in the local DB (`SELECT count(*) FROM stores WHERE ...` via the running Prisma dev DB or the dashboard state), button shows "Creating…" while pending, and the settings view transitions to the normal store editor.

- [ ] **Step 3: Full checks + commit**

Run: `npm run test && npm run typecheck && npm run build`
Expected: 40 passing, clean, green.

```bash
git add src/app/dashboard/settings/page.tsx
git commit -m "fix: create-store form — pending state, double-click guard, 409 treated as success, errors surfaced"
```

---

### Task 3: Account validation schemas

**Files:**
- Modify: `src/lib/validators.ts` (append after `registerSchema`)
- Test: `src/lib/validators.test.ts` (append)

**Interfaces:**
- Produces: `updateAccountSchema` (fields: `name` string 2–100 optional, `email` valid email optional, `phone` — valid MY phone | `""`→undefined | **`null` passes through as `null`** meaning "clear"), `changePasswordSchema` (`currentPassword` string min 1, `newPassword` string min 8). Task 4 imports both. Exported types `UpdateAccountInput`, `ChangePasswordInput`.

- [ ] **Step 1: Write failing tests**

Append to `src/lib/validators.test.ts`:

```ts
import { updateAccountSchema, changePasswordSchema } from "./validators";

describe("updateAccountSchema", () => {
  it("accepts a partial update with just a name", () => {
    expect(updateAccountSchema.safeParse({ name: "Muaz H" }).success).toBe(true);
  });

  it("passes null phone through as null (explicit clear)", () => {
    const r = updateAccountSchema.safeParse({ phone: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.phone).toBeNull();
  });

  it("treats empty-string phone as absent (unchanged)", () => {
    const r = updateAccountSchema.safeParse({ phone: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.phone).toBeUndefined();
  });

  it("rejects an invalid phone", () => {
    expect(updateAccountSchema.safeParse({ phone: "12345" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(updateAccountSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("requires current password and 8+ char new password", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "x", newPassword: "longenough1" }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ currentPassword: "", newPassword: "longenough1" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: "x", newPassword: "short" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test`
Expected: FAIL — `updateAccountSchema` not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/validators.ts` (below `registerSchema`):

```ts
// ---- Account Schemas ----

// phone: undefined = unchanged, null = clear, string = validated MY number.
// "" (blank form input) maps to undefined like optionalPhoneSchema.
const clearablePhoneSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  phoneSchema.nullable().optional()
);

export const updateAccountSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100).optional(),
  email: z.string().email("Please enter a valid email").optional(),
  phone: clearablePhoneSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test`
Expected: 40 + 7 new = 47 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators.ts src/lib/validators.test.ts
git commit -m "feat: account update + password change schemas with clearable phone"
```

---

### Task 4: Account APIs

**Files:**
- Create: `src/app/api/account/route.ts`
- Create: `src/app/api/account/password/route.ts`

**Interfaces:**
- Consumes: `updateAccountSchema`, `changePasswordSchema` from Task 3; `auth` from `@/lib/auth`; `prisma` from `@/lib/prisma`; `bcrypt` from `bcryptjs`.
- Produces: `PUT /api/account` → 200 `{ success: true, data: { id, name, email, phone } }`; 409 `{ code: "EMAIL_TAKEN" }`. `PUT /api/account/password` → 200 `{ success: true }`; 403 `{ code: "WRONG_PASSWORD" }`. Task 5's UI consumes these exact codes.

- [ ] **Step 1: Implement `src/app/api/account/route.ts`**

```ts
// =============================================================================
// Account API — profile updates for the signed-in user
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { updateAccountSchema } from "@/lib/validators";

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateAccountSchema.safeParse(body);
  if (!parsed.success) {
    const errors = Object.fromEntries(
      parsed.error.issues.map((i) => [i.path.join("."), i.message])
    );
    return NextResponse.json(
      { success: false, error: "Validation failed", errors },
      { status: 400 }
    );
  }

  const { name, email, phone } = parsed.data;

  if (email) {
    const taken = await prisma.user.findFirst({
      where: { email, NOT: { id: session.user.id } },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json(
        { success: false, code: "EMAIL_TAKEN", error: "That email is already in use." },
        { status: 409 }
      );
    }
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(phone !== undefined ? { phone } : {}), // null clears, string sets
    },
    select: { id: true, name: true, email: true, phone: true },
  });

  return NextResponse.json({ success: true, data: user });
}
```

- [ ] **Step 2: Implement `src/app/api/account/password/route.ts`**

```ts
// =============================================================================
// Account API — password change (requires current password)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { changePasswordSchema } from "@/lib/validators";

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    const errors = Object.fromEntries(
      parsed.error.issues.map((i) => [i.path.join("."), i.message])
    );
    return NextResponse.json(
      { success: false, error: "Validation failed", errors },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json(
      { success: false, code: "WRONG_PASSWORD", error: "Current password is incorrect." },
      { status: 403 }
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash },
  });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Verify against local dev (browse, logged in as merchant@test.my)**

Run: `$B js "fetch('/api/account',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Abang Ali Updated'})}).then(r=>r.json()).then(j=>{window.__a=JSON.stringify(j)})"` then `$B js "window.__a"`
Expected: `success: true`, `data.name` = "Abang Ali Updated".

Run the same shape for password: wrong current password → expect `code: "WRONG_PASSWORD"`, 403; correct (`merchant123` → new `merchant1234`) → `success: true`; then change it back.

- [ ] **Step 4: Full checks + commit**

Run: `npm run test && npm run typecheck && npm run build`
Expected: 47 passing, clean, green.

```bash
git add src/app/api/account/
git commit -m "feat: account profile and password APIs (session-scoped, current-password gated)"
```

---

### Task 5: Account page + nav

**Files:**
- Create: `src/app/dashboard/account/page.tsx`
- Modify: `src/app/dashboard/DashboardShell.tsx` (add "Account" nav item to the existing `navItems` array; add `aria-label="Toggle navigation menu"` to the `#mobile-menu-toggle` button)

**Interfaces:**
- Consumes: Task 4's `PUT /api/account` (409 `EMAIL_TAKEN`) and `PUT /api/account/password` (403 `WRONG_PASSWORD`). Session data via `GET /api/auth/session` for initial values.

- [ ] **Step 1: Create the page**

`src/app/dashboard/account/page.tsx` — follow the settings page's structure exactly (client page, glass cards). Two cards:

```tsx
"use client";

// =============================================================================
// Account — profile + password management for the signed-in merchant
// =============================================================================

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function AccountPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s) => {
        if (s?.user) {
          setName(s.user.name ?? "");
          setEmail(s.user.email ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (savingProfile) return;
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone: phone.trim() === "" ? null : phone }),
      });
      const data = await res.json();
      if (data.success) setProfileMsg({ ok: true, text: "Profile updated." });
      else if (data.code === "EMAIL_TAKEN") setProfileMsg({ ok: false, text: "That email is already in use." });
      else setProfileMsg({ ok: false, text: data.errors ? Object.values(data.errors).join(" ") : data.error });
    } catch {
      setProfileMsg({ ok: false, text: "Network problem — please try again." });
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (savingPassword) return;
    setSavingPassword(true);
    setPasswordMsg(null);
    try {
      const res = await fetch("/api/account/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setPasswordMsg({ ok: true, text: "Password changed." });
        setCurrentPassword("");
        setNewPassword("");
      } else if (data.code === "WRONG_PASSWORD") {
        setPasswordMsg({ ok: false, text: "Current password is incorrect." });
      } else {
        setPasswordMsg({ ok: false, text: data.errors ? Object.values(data.errors).join(" ") : data.error });
      }
    } catch {
      setPasswordMsg({ ok: false, text: "Network problem — please try again." });
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary)]" /></div>;

  const inputCls = "w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none";
  const labelCls = "text-xs font-bold text-[var(--color-text-secondary)]";
  const btnCls = "rounded-xl gradient-primary px-6 py-3 text-sm font-bold text-white disabled:opacity-60 disabled:cursor-not-allowed";
  const msg = (m: { ok: boolean; text: string }) => (
    <p className={`rounded-lg px-3 py-2 text-sm ${m.ok ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-500"}`}>{m.text}</p>
  );

  return (
    <div className="max-w-2xl space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Account</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">Your profile and sign-in details.</p>
      </div>

      <form onSubmit={saveProfile} className="glass rounded-2xl p-6 space-y-4">
        <h2 className="font-bold">Profile</h2>
        <div className="space-y-1.5">
          <label htmlFor="acct-name" className={labelCls}>Full Name</label>
          <input id="acct-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="acct-email" className={labelCls}>Email</label>
          <input id="acct-email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="acct-phone" className={labelCls}>Phone <span className="font-normal">(optional — leave blank to remove)</span></label>
          <input id="acct-phone" type="tel" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+60123456789" />
        </div>
        {profileMsg && msg(profileMsg)}
        <button type="submit" disabled={savingProfile} className={btnCls}>{savingProfile ? "Saving…" : "Save Profile"}</button>
      </form>

      <form onSubmit={savePassword} className="glass rounded-2xl p-6 space-y-4">
        <h2 className="font-bold">Change Password</h2>
        <div className="space-y-1.5">
          <label htmlFor="acct-current" className={labelCls}>Current Password</label>
          <input id="acct-current" type="password" className={inputCls} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="acct-new" className={labelCls}>New Password <span className="font-normal">(min 8 characters)</span></label>
          <input id="acct-new" type="password" className={inputCls} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
        </div>
        {passwordMsg && msg(passwordMsg)}
        <button type="submit" disabled={savingPassword} className={btnCls}>{savingPassword ? "Changing…" : "Change Password"}</button>
      </form>
    </div>
  );
}
```

Note: the profile form always sends `phone: null` when blank — with a saved phone that clears it; with none it's a no-op. This is the UX for "leave blank to remove".

- [ ] **Step 2: Nav item + aria-label**

In `DashboardShell.tsx`, append to `navItems` (match the existing object shape and icon style — use a lucide-like user SVG consistent with neighbors):

```tsx
  {
    label: "Account",
    href: "/dashboard/account",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
```

Find the `#mobile-menu-toggle` button and add `aria-label="Toggle navigation menu"`.

- [ ] **Step 3: Browser verification (local dev, merchant@test.my)**

- Navigate to /dashboard → "Account" appears in the sidebar → open it.
- Change name → Save → success message; reload → new name persists.
- Set phone `0123456789` → save → reload → shows; blank it → save → DB `phone` is NULL.
- Wrong current password → "Current password is incorrect."; correct change → success → sign out → sign in with the new password works. Change it back to `merchant123`.
- Screenshot the account page to the scratchpad.

- [ ] **Step 4: Full checks + commit**

Run: `npm run test && npm run typecheck && npm run build`
Expected: 47 passing, clean, green.

```bash
git add src/app/dashboard/account/ src/app/dashboard/DashboardShell.tsx
git commit -m "feat: account page — profile editing and password change, Account nav item, mobile toggle aria-label"
```
