# QR Payment with Manual Confirmation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Stripe/Billplz gateway payment with merchant-uploaded DuitNow QR + customer proof screenshot + manual merchant confirmation, per `docs/superpowers/specs/2026-08-01-qr-payment-confirmation.md`.

**Architecture:** New pre-queue order state `AWAITING_CONFIRMATION` (status is a plain string column — no DB enum exists, confirmed). Queue number is assigned only on merchant Confirm, inside a transaction. Supabase Storage holds merchant QR images (public bucket) and payment proofs (private bucket, streamed to merchants through an authenticated route). The hardcoded 6% SST becomes a merchant-configured charge list applied **flat on the subtotal**. Cash follows the identical flow.

**Tech Stack:** Next.js 16, Prisma (string statuses), zod validators in `src/lib/validators.ts`, `@supabase/supabase-js` (already a dependency), vitest.

## Global Constraints

- **This is NOT the Next.js you know** (repo `AGENTS.md`): read the relevant guide in `node_modules/next/dist/docs/` before writing any route/page code.
- Commits: `<type>: <description>`. No attribution footers.
- Money is integer cents until the final `Prisma.Decimal((cents / 100).toFixed(2))` conversion — copy the existing pattern at `src/app/api/orders/route.ts:149-155`. Half-up rounding via `Math.round`.
- Order/store statuses are **strings**, not Postgres enums. `AWAITING_CONFIRMATION` needs no DB migration beyond new columns.
- Never run `prisma db seed` or `prisma migrate reset` against production (`.env.production.local`) — seed wipes all tables.
- UI matches the existing design system: `glass` class, CSS vars (`--color-primary`, `--color-text-muted`, `--color-warning`, `--color-border`), rounded-2xl/3xl, lucide-react icons.
- Verification: `npm test`, `npm run typecheck`. Lint has a known-dirty baseline (17 pre-existing errors) — changed lines must not ADD problems.
- Decided: charges are flat on subtotal; age badge + repeating alert are v1 scope; Stripe/Billplz code is deleted (git history is the archive).

---

### Task 1: Charges library (pure, TDD)

**Files:**
- Create: `src/lib/charges.ts`
- Test: `src/lib/charges.test.ts`
- Modify: `src/lib/validators.ts` (add charge schemas near the store schemas)

**Interfaces:**
- Produces: `type StoreCharge = { label: string; rate: number; enabled: boolean }`; `type ChargeLine = { label: string; rate: number; amountCents: number }`; `computeCharges(subtotalCents: number, charges: StoreCharge[] | null | undefined): { lines: ChargeLine[]; chargeTotalCents: number }`; `parseStoreCharges(value: unknown): StoreCharge[]` (zod-validated, `[]` on anything invalid); zod export `storeChargesSchema`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/charges.test.ts
import { describe, it, expect } from "vitest";
import { computeCharges, parseStoreCharges } from "./charges";

describe("computeCharges", () => {
  it("returns zero for empty/null charge lists", () => {
    expect(computeCharges(10000, []).chargeTotalCents).toBe(0);
    expect(computeCharges(10000, null).chargeTotalCents).toBe(0);
    expect(computeCharges(10000, undefined).lines).toEqual([]);
  });

  it("applies each charge flat on the subtotal, not compounding", () => {
    const { lines, chargeTotalCents } = computeCharges(10000, [
      { label: "Service charge", rate: 10, enabled: true },
      { label: "SST", rate: 6, enabled: true },
    ]);
    expect(lines).toEqual([
      { label: "Service charge", rate: 10, amountCents: 1000 },
      { label: "SST", rate: 6, amountCents: 600 },
    ]);
    expect(chargeTotalCents).toBe(1600); // NOT 1660 — no compounding
  });

  it("skips disabled and zero-rate lines", () => {
    const { lines } = computeCharges(10000, [
      { label: "SST", rate: 6, enabled: false },
      { label: "Nothing", rate: 0, enabled: true },
    ]);
    expect(lines).toEqual([]);
  });

  it("rounds half-up per line in cents", () => {
    // 6% of RM 1.75 (175c) = 10.5c → 11c
    const { chargeTotalCents } = computeCharges(175, [{ label: "SST", rate: 6, enabled: true }]);
    expect(chargeTotalCents).toBe(11);
  });
});

describe("parseStoreCharges", () => {
  it("accepts a valid list", () => {
    expect(parseStoreCharges([{ label: "SST", rate: 6, enabled: true }])).toHaveLength(1);
  });
  it("returns [] for garbage, null, wrong shapes, out-of-range rates", () => {
    expect(parseStoreCharges(null)).toEqual([]);
    expect(parseStoreCharges("x")).toEqual([]);
    expect(parseStoreCharges([{ label: "", rate: 6, enabled: true }])).toEqual([]);
    expect(parseStoreCharges([{ label: "SST", rate: 101, enabled: true }])).toEqual([]);
    expect(parseStoreCharges([{ label: "SST", rate: -1, enabled: true }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/charges.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```typescript
// src/lib/charges.ts
// Merchant-configured order charges (SST, service charge, …).
// DECIDED 2026-08-01: every line is rate% × subtotal — flat, no compounding.
import { z } from "zod";

export const storeChargeSchema = z.object({
  label: z.string().trim().min(1).max(30),
  rate: z.number().min(0).max(100),
  enabled: z.boolean(),
});
export const storeChargesSchema = z.array(storeChargeSchema).max(5);

export type StoreCharge = z.infer<typeof storeChargeSchema>;
export interface ChargeLine { label: string; rate: number; amountCents: number }

export function parseStoreCharges(value: unknown): StoreCharge[] {
  const parsed = storeChargesSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function computeCharges(
  subtotalCents: number,
  charges: StoreCharge[] | null | undefined
): { lines: ChargeLine[]; chargeTotalCents: number } {
  const lines: ChargeLine[] = (charges ?? [])
    .filter((c) => c.enabled && c.rate > 0)
    .map((c) => ({ label: c.label, rate: c.rate, amountCents: Math.round((subtotalCents * c.rate) / 100) }));
  return { lines, chargeTotalCents: lines.reduce((sum, l) => sum + l.amountCents, 0) };
}
```

In `src/lib/validators.ts`, re-export for API use: `export { storeChargesSchema } from "./charges";` (place near the store schemas; check the file's export style first).

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/charges.test.ts` → PASS, then `npm test && npm run typecheck` → all green.

- [ ] **Step 5: Commit** — `git add src/lib/charges.ts src/lib/charges.test.ts src/lib/validators.ts && git commit -m "feat: merchant-configurable order charges, flat on subtotal"`

---

### Task 2: Schema migration (additive only)

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces DB columns: `Store.paymentQrUrl String?`, `Store.paymentInstructions String?`, `Store.charges Json?`, `Order.paymentProofUrl String?`, `Order.confirmedAt DateTime?`, `Order.paymentMethod String @default("QR")`, `Order.chargeBreakdown Json?`.

- [ ] **Step 1: Add fields.** In the `Store` model (after `gatewayMerchantId`):

```prisma
  paymentQrUrl        String?
  paymentInstructions String?
  charges             Json?
```

In the `Order` model (after `paymentStatus`):

```prisma
  paymentMethod   String    @default("QR")
  paymentProofUrl String?
  confirmedAt     DateTime?
  chargeBreakdown Json?
```

Do NOT remove `paymentIntentId` / `paymentGateway` / `Store.paymentGateway` / `Store.gatewayMerchantId` — deprecated-but-retained per spec.

- [ ] **Step 2: Create the migration against the LOCAL dev DB.** Start it if needed (`npx prisma dev` in background, matching `.env`'s port 51230), then:

`npx prisma migrate dev --name qr_payment_confirmation`
Expected: migration SQL contains only `ALTER TABLE ... ADD COLUMN` statements. Inspect it and confirm nothing destructive.

- [ ] **Step 3: Verify** — `npm run typecheck && npm test` → green (regenerated client picks up new fields).

- [ ] **Step 4: Commit** — `git add prisma && git commit -m "feat: schema for QR payment confirmation and charge list"`

(Production `prisma migrate deploy` happens in Task 10 — code first, then prod columns.)

---

### Task 3: Storage library + image sniffing (TDD on the pure part) — **USER-ASSISTED (service key)**

**Files:**
- Create: `src/lib/image-sniff.ts`, `src/lib/image-sniff.test.ts`, `src/lib/storage.ts`, `scripts/setup-storage.mjs`

**Interfaces:**
- Consumes env: `SUPABASE_URL` (`https://jpwkcpflimjjqllggkwe.supabase.co`), `SUPABASE_SERVICE_ROLE_KEY` (**ask Muaz** — Supabase dashboard → Project Settings → API; server-only, never `NEXT_PUBLIC_`).
- Produces: `sniffImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null`; `MAX_UPLOAD_BYTES = 5 * 1024 * 1024`; `uploadPublicAsset(key: string, bytes: Uint8Array, contentType: string): Promise<string>` (returns public URL); `uploadPaymentProof(key: string, bytes: Uint8Array, contentType: string): Promise<string>` (returns storage key); `getPaymentProofBytes(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null>`. Buckets: `public-assets` (public), `payment-proofs` (private).

- [ ] **Step 1: Failing sniff tests**

```typescript
// src/lib/image-sniff.test.ts
import { describe, it, expect } from "vitest";
import { sniffImageType } from "./image-sniff";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("sniffImageType", () => {
  it("identifies jpeg/png/webp by magic bytes", () => {
    expect(sniffImageType(jpeg)).toBe("image/jpeg");
    expect(sniffImageType(png)).toBe("image/png");
    expect(sniffImageType(webp)).toBe("image/webp");
  });
  it("rejects everything else", () => {
    expect(sniffImageType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull(); // PDF
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x47, 0x49, 0x46]))).toBeNull(); // GIF & truncated
  });
});
```

- [ ] **Step 2: Run → FAIL**, then implement:

```typescript
// src/lib/image-sniff.ts
// Magic-byte sniffing — never trust a client-declared MIME type.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function sniffImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return null;
}
```

Run → PASS.

- [ ] **Step 3: Storage module**

```typescript
// src/lib/storage.ts
// Server-only Supabase Storage access (service role key — never expose client-side).
import { createClient } from "@supabase/supabase-js";

export const PUBLIC_BUCKET = "public-assets";
export const PROOF_BUCKET = "payment-proofs";

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase storage not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function uploadPublicAsset(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const supabase = client();
  const { error } = await supabase.storage.from(PUBLIC_BUCKET).upload(key, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(key).data.publicUrl;
}

export async function uploadPaymentProof(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const { error } = await client().storage.from(PROOF_BUCKET).upload(key, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return key;
}

export async function getPaymentProofBytes(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const { data, error } = await client().storage.from(PROOF_BUCKET).download(key);
  if (error || !data) return null;
  return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type || "image/jpeg" };
}
```

- [ ] **Step 4: Bucket bootstrap script (idempotent)**

```javascript
// scripts/setup-storage.mjs — run once per environment:
//   node --env-file=.env.production.local scripts/setup-storage.mjs
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in that env file.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
for (const [name, isPublic] of [["public-assets", true], ["payment-proofs", false]]) {
  const { error } = await supabase.storage.createBucket(name, {
    public: isPublic,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (error && !/already exists/i.test(error.message)) throw error;
  console.log(`${name}: ${error ? "exists" : "created"} (public=${isPublic})`);
}
```

**USER step:** ask Muaz for the service role key; append `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to `.env` and `.env.production.local`; run the script against production; expect both bucket lines printed.

- [ ] **Step 5: Verify + commit** — `npm test && npm run typecheck` green. `git add src/lib/image-sniff.* src/lib/storage.ts scripts/setup-storage.mjs && git commit -m "feat: Supabase Storage lib, image magic-byte sniffing, bucket bootstrap"`

---

### Task 4: Merchant upload endpoint

**Files:**
- Create: `src/app/api/upload/route.ts`

**Interfaces:**
- Consumes: Task 3 (`sniffImageType`, `MAX_UPLOAD_BYTES`, `uploadPublicAsset`), NextAuth session via the same `auth()`/`getServerSession` helper other merchant routes use — copy the exact auth pattern from `src/app/api/stores/route.ts`.
- Produces: `POST /api/upload` (multipart field `file`, optional field `kind` ∈ `qr|menu|logo`) → `201 { success: true, data: { url } }`. Errors: 401 unauthenticated, 400 `INVALID_IMAGE` / `FILE_TOO_LARGE`.

- [ ] **Step 1: Implement**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { sniffImageType, MAX_UPLOAD_BYTES } from "@/lib/image-sniff";
import { uploadPublicAsset } from "@/lib/storage";
// AUTH: import and use the exact session helper used in src/app/api/stores/route.ts

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const KINDS = new Set(["qr", "menu", "logo"]);

export async function POST(request: NextRequest) {
  // 1) require merchant session (copy pattern) → 401 otherwise
  // 2) parse form
  const form = await request.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "menu");
  if (!(file instanceof File) || !KINDS.has(kind)) {
    return NextResponse.json({ success: false, error: "INVALID_IMAGE" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ success: false, error: "FILE_TOO_LARGE" }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) {
    return NextResponse.json({ success: false, error: "INVALID_IMAGE" }, { status: 400 });
  }
  // key: server-generated only — caller filename never touches the path
  const key = `${kind}/${session.user.id}/${randomUUID()}.${EXT[type]}`;
  const url = await uploadPublicAsset(key, bytes, type);
  return NextResponse.json({ success: true, data: { url } }, { status: 201 });
}
```

(The `session` reference comes from the auth step you copied — wire it accordingly. Wrap the handler body in the same try/catch → 500 pattern the other routes use.)

- [ ] **Step 2: Verify manually** — `npm run typecheck` green; with the dev server + local DB running, log in as the seed merchant and:

```bash
curl -s -X POST http://localhost:3000/api/upload -F "file=@some.png" -F "kind=qr" -H "Cookie: <session cookie>"
# expect 201 with a supabase.co public URL; repeat with a .txt file → 400 INVALID_IMAGE; no cookie → 401
```

- [ ] **Step 3: Commit** — `git commit -am "feat: merchant image upload endpoint (Supabase Storage)"`

---

### Task 5: Order creation rework + gateway code deletion

**Files:**
- Modify: `src/app/api/orders/route.ts` (POST section, lines ~84-232), `src/lib/validators.ts`
- Delete: `src/lib/payments/stripe.ts`, `src/lib/payments/billplz.ts`, `src/lib/payments/service.ts`, `src/lib/payments/types.ts`, `src/app/api/webhooks/[provider]/route.ts`, the Billplz signature test file (locate via `grep -rl billplz src/ --include='*.test.ts'`)

**Interfaces:**
- Consumes: `computeCharges`/`parseStoreCharges` (Task 1), schema fields (Task 2).
- Produces: `POST /api/orders` always creates `status: "AWAITING_CONFIRMATION"`, `queueNumber: null`, `paymentMethod` from body; response `201 { success: true, data: { orderId, status } }`. Consumed by Tasks 6-9.

- [ ] **Step 1: Validator swap.** In `src/lib/validators.ts`: line 106 `paymentGateway: z.enum(["STRIPE","BILLPLZ","CASH"]).optional().default("STRIPE")` → `paymentMethod: z.enum(["QR", "CASH"]).default("QR")`. Line 59 (updateStore): remove the `paymentGateway` enum field; add `paymentInstructions: z.string().max(200).optional()`, `paymentQrUrl: z.string().url().optional()`, `charges: storeChargesSchema.optional()`. Check `validators.test.ts` for assertions on the old shapes and update them to the new shapes (keep test intent: valid passes, invalid fails).

- [ ] **Step 2: Rewrite the POST tail.** Keep: rate-limit check, zod parse, store ACTIVE check, `isStoreOpen` check, menu-item validation, subtotal computation in cents. Extend the store select at line ~88 with `charges: true`. Then replace everything from the tax line (~149) through the gateway branch (~232) with:

```typescript
    const { lines: chargeLines, chargeTotalCents } = computeCharges(
      subtotalCents,
      parseStoreCharges(store.charges)
    );
    const totalCents = subtotalCents + chargeTotalCents;

    const subtotal = new Prisma.Decimal((subtotalCents / 100).toFixed(2));
    const tax = new Prisma.Decimal((chargeTotalCents / 100).toFixed(2));
    const total = new Prisma.Decimal((totalCents / 100).toFixed(2));

    // Queue number is assigned on merchant confirmation, never here.
    const order = await prisma.order.create({
      data: {
        storeId,
        customerPhone,
        customerName,
        notes,
        subtotal,
        tax,
        total,
        chargeBreakdown: chargeLines,
        status: "AWAITING_CONFIRMATION",
        paymentMethod: parsed.data.paymentMethod,
        paymentStatus: "PENDING",
        orderItems: { create: orderItemsData },
      },
      select: { id: true, status: true },
    });

    return NextResponse.json(
      { success: true, data: { orderId: order.id, status: order.status } },
      { status: 201 }
    );
```

(`orderItemsData` = the existing items mapping already built earlier in the handler — reuse it verbatim. Remove the now-unused imports: `assignQueueNumber`, payment service functions.)

- [ ] **Step 3: Delete gateway code** — `git rm -r src/lib/payments src/app/api/webhooks` plus the Billplz test file. Sweep: `grep -rn "stripe\|billplz\|isPaymentProviderConfigured\|paymentIntentId" src/ -il` → only files where it is a deprecated schema column reference may remain (e.g. schema.prisma).

- [ ] **Step 4: Verify** — `npm test && npm run typecheck` green (checkout client still references the old field — expect typecheck failure ONLY if it imports deleted modules; if the checkout page breaks typecheck, stub the submit body minimally now (`paymentMethod: "QR"`) and note that Task 8 rebuilds it properly).

- [ ] **Step 5: Commit** — `git commit -am "feat: orders create AWAITING_CONFIRMATION with charge list; remove Stripe/Billplz"`

---

### Task 6: Proof upload (public) + proof view (merchant)

**Files:**
- Create: `src/app/api/orders/[orderId]/proof/route.ts`

**Interfaces:**
- Consumes: Task 3 storage/sniff helpers; auth pattern from `src/app/api/orders/[orderId]/route.ts` (owner/admin check at its lines ~116-124).
- Produces: `PATCH /api/orders/[orderId]/proof` (public, multipart `file`) → `200 { success: true }`; guards: 404 no order, 409 `PROOF_ALREADY_ATTACHED`, 422 wrong status, 400 invalid image/too large, 429 rate-limited. `GET /api/orders/[orderId]/proof` (merchant owner or admin only) → image bytes with correct Content-Type, 404 if none.

- [ ] **Step 1: Implement both handlers in one route file**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"; // match existing import names — check rate-limit.ts exports
import { sniffImageType, MAX_UPLOAD_BYTES } from "@/lib/image-sniff";
import { uploadPaymentProof, getPaymentProofBytes } from "@/lib/storage";

// PATCH — customer attaches payment proof. Public: constrain hard.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params; // Next 16: params is a Promise — verify against node_modules/next/dist/docs
  if (!checkRateLimit(`proof:${getClientIp(request)}`, 5)) {
    return NextResponse.json({ success: false, error: "RATE_LIMITED" }, { status: 429 });
  }
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, paymentProofUrl: true },
  });
  if (!order) return NextResponse.json({ success: false, error: "NOT_FOUND" }, { status: 404 });
  if (order.paymentProofUrl) return NextResponse.json({ success: false, error: "PROOF_ALREADY_ATTACHED" }, { status: 409 });
  if (order.status !== "AWAITING_CONFIRMATION") {
    return NextResponse.json({ success: false, error: "INVALID_STATUS" }, { status: 422 });
  }
  const file = (await request.formData()).get("file");
  if (!(file instanceof File) || file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ success: false, error: "INVALID_IMAGE" }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) return NextResponse.json({ success: false, error: "INVALID_IMAGE" }, { status: 400 });

  const key = `${orderId}/${randomUUID()}`;
  await uploadPaymentProof(key, bytes, type);
  // Guard against a concurrent double-submit: only write if still empty.
  const updated = await prisma.order.updateMany({
    where: { id: orderId, paymentProofUrl: null },
    data: { paymentProofUrl: key },
  });
  if (updated.count === 0) return NextResponse.json({ success: false, error: "PROOF_ALREADY_ATTACHED" }, { status: 409 });
  return NextResponse.json({ success: true });
}

// GET — merchant/admin views the proof (private bucket, streamed).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  // AUTH: session + (order.store.ownerId === session.user.id || role ADMIN) — copy from [orderId]/route.ts
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { paymentProofUrl: true, store: { select: { ownerId: true } } },
  });
  // …auth checks here → 401/403…
  if (!order?.paymentProofUrl) return new NextResponse(null, { status: 404 });
  const proof = await getPaymentProofBytes(order.paymentProofUrl);
  if (!proof) return new NextResponse(null, { status: 404 });
  return new NextResponse(proof.bytes, {
    headers: { "Content-Type": proof.contentType, "Cache-Control": "private, max-age=300" },
  });
}
```

Fill the two AUTH comment blocks with the exact working pattern from `src/app/api/orders/[orderId]/route.ts` (session fetch at ~line 90, ownership check at ~116-124). Wrap both in the standard try/catch → 500.

- [ ] **Step 2: Verify manually** (dev server + local DB): create an order via the storefront, then `curl -X PATCH -F "file=@receipt.png" http://localhost:3000/api/orders/<id>/proof` → 200; repeat → 409; PDF → 400; merchant-authed GET → image bytes; unauthenticated GET → 401.

- [ ] **Step 3: Commit** — `git commit -am "feat: payment proof upload (public, constrained) and merchant proof view"`

---

### Task 7: Merchant confirm/reject + SSE/list visibility

**Files:**
- Modify: `src/app/api/orders/[orderId]/route.ts` (`VALID_TRANSITIONS` line 14, PATCH body ~lines 128-160), `src/app/api/queue/stream/route.ts` (line 83), `src/app/api/orders/route.ts` GET (no change needed — status filter is caller-supplied), `src/app/api/orders/[orderId]/route.ts` GET (add fields)

**Interfaces:**
- Consumes: `assignQueueNumber(storeId)` from `@/lib/queue` (same import as orders/route.ts line 10).
- Produces: transition `AWAITING_CONFIRMATION → PAID` (assigns queue number, sets `confirmedAt`, `paidAt`, `paymentStatus: "PAID"`, all in one transaction) and `AWAITING_CONFIRMATION → CANCELLED`. SSE stream and order GET expose `paymentMethod`, `hasProof`.

- [ ] **Step 1: Transitions.** Add as the FIRST entry of `VALID_TRANSITIONS`:

```typescript
  AWAITING_CONFIRMATION: ["PAID", "CANCELLED"],
```

Check `updateOrderStatusSchema` in validators.ts — if it enumerates target statuses, ensure `PAID` and `CANCELLED` are present (they should already be).

- [ ] **Step 2: Confirmation write.** In the PATCH handler, where the update executes (~line 150), special-case the confirm transition:

```typescript
    if (existing.status === "AWAITING_CONFIRMATION" && newStatus === "PAID") {
      const updated = await prisma.$transaction(async (tx) => {
        const queueNumber = await assignQueueNumber(existing.storeId); // NOTE: if assignQueueNumber doesn't accept a tx client, call it before the transaction — read src/lib/queue.ts and keep atomicity as close as it allows
        return tx.order.update({
          where: { id: orderId },
          data: { status: "PAID", queueNumber, confirmedAt: new Date(), paidAt: new Date(), paymentStatus: "PAID" },
        });
      });
      return NextResponse.json({ success: true, data: updated });
    }
```

Read `src/lib/queue.ts` first: if `assignQueueNumber` manages its own transaction, do NOT nest — call it immediately before a plain `order.update` and accept the tiny gap (numbers are per-store daily counters; a crash between the two calls burns one number, which is harmless).

- [ ] **Step 3: Visibility.** `src/app/api/queue/stream/route.ts:83`: `status: { in: ["AWAITING_CONFIRMATION", "PAID", "ACCEPTED", "PREPARING", "READY"] }` — and add `paymentMethod: true, paymentProofUrl: true, createdAt: true` to that query's select if not present, mapping `hasProof: !!o.paymentProofUrl` into the SSE payload (never leak the storage key publicly — check whether this query feeds the public ORDER_UPDATE too; for the public payload send only status/queueNumber/estimatedWaitMins as today). In the order GET (`[orderId]/route.ts` ~line 53 response), add to the public projection: `paymentMethod`, `hasProof: !!order.paymentProofUrl`, and the store's `paymentQrUrl` + `paymentInstructions` (needed by the customer payment panel, Task 9).

- [ ] **Step 4: Verify** — `npm test && npm run typecheck`; manual: create order → confirm via `curl -X PATCH … -d '{"status":"PAID"}'` with merchant cookie → response has a `queueNumber`; reject path → CANCELLED with `queueNumber: null`; invalid `AWAITING_CONFIRMATION → PREPARING` → 422.

- [ ] **Step 5: Commit** — `git commit -am "feat: merchant confirm/reject with transactional queue assignment"`

---

### Task 8: Checkout rework (customer)

**Files:**
- Modify: `src/app/store/[slug]/checkout/CheckoutClient.tsx`

**Interfaces:**
- Consumes: `POST /api/orders` new contract (Task 5).
- Produces: submit body `{ ...existing, paymentMethod: "QR" | "CASH" }`; always `router.push` to `/store/${slug}/order/${orderId}` on 201.

- [ ] **Step 1: Rework.** Replace `type PaymentGateway` (line 10) and the `paymentGateway` state (line 21) with `const [paymentMethod, setPaymentMethod] = useState<"QR" | "CASH">("QR")`. Replace the three option cards (lines ~193-207) with two, same card markup/classes:

```tsx
{([
  { key: "QR", icon: <QrCode className="h-6 w-6" />, title: "Scan & Pay (DuitNow QR)", sub: "Pay from any banking app, then upload your receipt" },
  { key: "CASH", icon: <Banknote className="h-6 w-6" />, title: "Pay at Counter", sub: "The shop confirms once you've paid" },
] as const).map(...)
```

(`QrCode` from lucide-react.) Remove the Stripe/FPX redirect branch (~line 82's counterpart) — every successful submit now routes to the order page. Update the footnote copy (lines ~222-230): both methods read "Your queue number is issued once the shop confirms your payment."

- [ ] **Step 2: Verify** — typecheck green; manual: place a QR order and a CASH order on the dev server → both land on the order page with status AWAITING_CONFIRMATION.

- [ ] **Step 3: Commit** — `git commit -am "feat: checkout offers QR/cash with merchant-confirmation flow"`

---

### Task 9: Customer order page — payment panel + waiting state

**Files:**
- Modify: `src/app/store/[slug]/order/[orderId]/page.tsx`
- Create: `src/components/customer/PaymentPanel.tsx`

**Interfaces:**
- Consumes: order GET now returning `paymentMethod`, `hasProof`, `store.paymentQrUrl`, `store.paymentInstructions` (Task 7); proof PATCH (Task 6); SSE pushes the status flip to PAID.
- Produces: `<PaymentPanel order={order} onProofUploaded={() => setHasProof(true)} />` rendered when `status === "AWAITING_CONFIRMATION"`.

- [ ] **Step 1: PaymentPanel component.** New client component, design-system styling (`glass rounded-3xl p-6`):
  - If `paymentMethod === "QR"` and `store.paymentQrUrl`: show the QR image (plain `<img>`, consistent with the codebase), the exact `total` in large type ("Transfer exactly RM 23.50"), optional `paymentInstructions` line, then: if `!hasProof`, a file input + "I've paid — upload receipt" button that PATCHes `/api/orders/${order.id}/proof` (FormData, show upload errors inline: too large / not an image / already uploaded); if `hasProof`, a check icon + "Receipt sent — waiting for the shop to confirm."
  - If `paymentMethod === "CASH"`: "Pay at the counter — the shop will confirm your order." (no upload required for cash; the upload control stays hidden)
  - If QR method but the store has no `paymentQrUrl` (merchant never uploaded one): show `paymentInstructions` if present, else "Please pay at the counter — the shop will confirm your order." Never a broken image.

- [ ] **Step 2: Wire into the page.** In `page.tsx`: the steps array (line ~112) currently starts at PAID/"Confirmed" — `findIndex` for AWAITING_CONFIRMATION returns -1, so guard: when `order.status === "AWAITING_CONFIRMATION"`, render `<PaymentPanel …>` in place of the queue-number hero (which currently shows `order.queueNumber || "..."` at line ~155) and suppress the step tracker. Headline: "Almost there — complete your payment". The existing SSE subscription (line ~92) already updates `status`; when it flips to PAID the normal queue hero takes over with the real number.

- [ ] **Step 3: Verify manually** — QR order: order page shows QR + total, upload a PNG → "Receipt sent"; confirm as merchant in another tab → page flips live to queue number without refresh. CASH order: no upload control. Reject → cancelled state renders (existing).

- [ ] **Step 4: Commit** — `git commit -am "feat: customer payment panel and awaiting-confirmation state"`

---

### Task 10: Merchant Kanban — Unconfirmed column, age badge, repeating alert

**Files:**
- Modify: `src/app/dashboard/page.tsx` (COLUMNS line 30, fetch line 67, audio lines 86-101)
- Create: `src/components/dashboard/OrderAgeBadge.tsx`

**Interfaces:**
- Consumes: SSE/list orders now include AWAITING_CONFIRMATION with `hasProof`, `paymentMethod`, `createdAt` (Task 7); proof GET for thumbnails (Task 6).
- Produces: leading Kanban column; Confirm/Reject actions reuse the existing status-PATCH plumbing (`nextStatus: "PAID"`, `rejectStatus: "CANCELLED"`).

- [ ] **Step 1: Column + fetch.** Prepend to `COLUMNS`:

```typescript
  { key: "AWAITING_CONFIRMATION", label: "Unconfirmed", color: "var(--color-warning)", nextAction: "Confirm", nextStatus: "PAID", rejectStatus: "CANCELLED" },
```

Fetch (line 67): `status=AWAITING_CONFIRMATION,PAID,ACCEPTED,PREPARING,READY`.

- [ ] **Step 2: Card extras for this column only:** payment-method chip (`QR`/`CASH`), and when `hasProof` a small thumbnail `<img src={`/api/orders/${order.id}/proof`} …>` that opens full-size on click (simple modal or new tab — match existing modal patterns if one exists, else `window.open`).

- [ ] **Step 3: Age badge (self-contained component):**

```tsx
// src/components/dashboard/OrderAgeBadge.tsx
"use client";
import { useEffect, useState } from "react";

const DANGER_MS = 3 * 60 * 1000; // red past 3 minutes — pilot-tunable

export function OrderAgeBadge({ createdAt }: { createdAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.max(0, now - new Date(createdAt).getTime());
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  const danger = elapsed > DANGER_MS;
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${danger ? "bg-red-500/15 text-red-500 animate-pulse" : "bg-[var(--color-border)] text-[var(--color-text-muted)]"}`}>
      {mins}:{String(secs).padStart(2, "0")}
    </span>
  );
}
```

Render it on every Unconfirmed card.

- [ ] **Step 4: Repeating alert.** Today the chime fires once when the PAID count rises (lines 86-101). Change the trigger count to `AWAITING_CONFIRMATION` orders, and add a repeat: while `unconfirmedCount > 0`, replay the existing audio every 20 seconds (one `setInterval`, cleared when the count drops to 0 or on unmount — guard so remounting does not stack intervals). Keep the same audio data URI.

- [ ] **Step 5: Verify manually** — place a QR order: it appears in Unconfirmed with ticking badge, chime repeats ~20s; Confirm → moves to New Orders with a queue number, chime stops; Reject removes it. Badge turns red after 3 minutes (temporarily set `DANGER_MS = 10_000` to see it, then restore).

- [ ] **Step 6: Commit** — `git commit -am "feat: unconfirmed column with proof thumbnail, age badge, repeating alert"`

---

### Task 11: Merchant settings — QR upload, instructions, charges editor

**Files:**
- Modify: `src/app/dashboard/settings/page.tsx`, `src/app/api/stores/[storeId]/route.ts` (PUT — accept the three new fields; validator already updated in Task 5)

**Interfaces:**
- Consumes: `POST /api/upload` (Task 4), `PUT /api/stores/[storeId]` with `paymentQrUrl`, `paymentInstructions`, `charges`.
- Produces: merchant-visible "Payments & Charges" settings card.

- [ ] **Step 1: API.** In the stores PUT handler, pass through the three validated fields into `prisma.store.update` (same pattern as the existing fields — find the `data:` object and extend it).

- [ ] **Step 2: Settings card.** New section following the existing card patterns on the settings page:
  - **DuitNow QR:** image preview of current `paymentQrUrl` (or empty-state), file input → `POST /api/upload` (`kind=qr`) → on success save the returned URL via the store PUT. Copy under it: "Customers scan this to pay you directly. Money goes straight to your bank — QueLess never touches it."
  - **Payment instructions:** single text input (max 200), saved on the same form.
  - **Charges:** editable rows (label, rate %, enabled toggle) mapping to `StoreCharge[]`, max 5 rows, an "Add charge" button, client-side zod validation with `storeChargesSchema` before save. Helper copy: "Applied on the subtotal, each calculated independently. Only add SST if your business is SST-registered."

- [ ] **Step 3: Verify manually** — upload a QR image, add `SST 6%` enabled, save, reload → persists; storefront order for that store now carries the 6% line in `chargeBreakdown` and totals correctly; disable the charge → next order has no tax.

- [ ] **Step 4: Commit** — `git commit -am "feat: merchant payment QR, instructions, and charge list settings"`

---

### Task 12: Production migration + full sweep

**Files:**
- Modify: `FINAL_HANDOVER.md` (payment section), `.env` / `.env.production.local` (retire gateway vars)

- [ ] **Step 1: Full local green** — `npm test && npm run typecheck && npm run build` → all pass.

- [ ] **Step 2: End-to-end dry run on dev** (dev server + local DB): register fresh merchant → create store → upload QR → add charge → place QR order from an incognito storefront → upload proof → confirm → advance PREPARING → READY → COMPLETED. Every step must behave; fix anything that doesn't before touching prod.

- [ ] **Step 3: Deploy schema to production** — `npx prisma migrate deploy` with `.env.production.local` env (`node --env-file` won't work for the CLI; use `dotenv -e .env.production.local -- npx prisma migrate deploy` or export the vars inline). Verify: `migrate status` shows all applied. Additive-only, so zero downtime.

- [ ] **Step 4: Retire gateway env vars** — remove `STRIPE_*`, `BILLPLZ_*` from local env files and from the deployment platform's variables (Railway or Cloudflare, whichever is live — coordinate with the migration plan's state).

- [ ] **Step 5: Sweep** — `grep -rni "stripe\|billplz\|toyyibpay" src/ docs/FINAL_HANDOVER.md FINAL_HANDOVER.md` → remaining hits only in schema deprecation comments and dated docs/specs (acceptable); update `FINAL_HANDOVER.md`'s payment description to the QR flow.

- [ ] **Step 6: Commit** — `git commit -am "chore: production schema deploy, retire gateway config, docs sweep"`

---

## Self-review notes (spec → tasks)

- Spec schema fields → Task 2 (all seven; `paymentMethod` added for the cash/QR analytics split the user chose to keep).
- Spec API table → Tasks 4, 5, 6, 7 (upload / orders POST / proof PATCH+GET / confirm; webhook deletion in Task 5).
- Spec security list → Task 6 (single-write, magic bytes, size cap, rate limit, private bucket via streamed authed GET, server-generated keys).
- Spec UI section → Tasks 8, 9, 10, 11.
- Spec v1 mitigations (age badge, repeating alert) → Task 10.
- Charges flat-on-subtotal + stored breakdown → Tasks 1, 5.
- Audio alert moves to AWAITING_CONFIRMATION → Task 10 Step 4.
