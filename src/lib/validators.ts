// =============================================================================
// Smart Queue Web System — Zod Validation Schemas
// =============================================================================

import { z } from "zod";
import { isHttpUrl } from "./utils";
import { MAX_QTY_LIMIT, qtyLimitRangeError } from "./order-limits";

// ---- Phone Validation (Malaysian format) ----

export const phoneSchema = z
  .string()
  .regex(
    /^(\+?60|0)[1-9]\d{7,9}$/,
    "Please enter a valid Malaysian phone number (e.g., +60123456789 or 0123456789)"
  );

// Optional phone: HTML forms submit empty inputs as "", which must not
// trigger the format error — treat "" (and whitespace) as absent.
export const optionalPhoneSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  phoneSchema.optional()
);

// ---- Image URL Validation ----

// Image fields are free-text merchant input; a non-URL value renders as a
// broken image. Blank inputs mean "no image", so treat "" as absent like
// optionalPhoneSchema does. Shares isHttpUrl with the render-side check so a
// saved value never falls back to the placeholder.
export const optionalImageUrlSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .refine(isHttpUrl, "Image URL must be a full http:// or https:// address")
    .optional()
    .nullable()
);

// ---- Store Schemas ----

import { storeChargesSchema } from "./charges";
export { storeChargesSchema };

export const createStoreSchema = z.object({
  name: z.string().min(2, "Store name must be at least 2 characters").max(100),
  description: z.string().max(500).optional(),
  phone: optionalPhoneSchema,
  address: z.string().max(300).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  avgPrepTimeMins: z.number().int().min(1).max(60).default(10),
  maxConcurrentOrders: z.number().int().min(1).max(50).default(5),
  operatingHours: z
    .record(z.string(),
      z.object({
        open: z.string().regex(/^\d{2}:\d{2}$/),
        close: z.string().regex(/^\d{2}:\d{2}$/),
        isClosed: z.boolean(),
      })
    )
    .optional(),
  gatewayMerchantId: z.string().optional(),
  paymentInstructions: z.string().max(200).optional(),
  // The QR is rendered as an <img src> on the customer's payment screen.
  // z.string().url() alone accepts javascript:/data:/arbitrary-http URLs; a
  // legitimate value is always an https Supabase Storage URL produced by
  // /api/upload, so restrict to that origin — blocks hostile schemes and
  // external/tracking URLs a malicious merchant could otherwise show customers.
  paymentQrUrl: z
    .string()
    .url()
    .refine(
      (u) => {
        try {
          const parsed = new URL(u);
          return parsed.protocol === "https:" && parsed.hostname.endsWith(".supabase.co");
        } catch {
          return false;
        }
      },
      { message: "Payment QR must be an uploaded image URL" }
    )
    .optional(),
  charges: storeChargesSchema.optional(),
});

// Emergency queue pause (dashboard toggle only — not part of store creation).
export const updateStoreSchema = createStoreSchema.partial().extend({
  ordersPaused: z.boolean().optional(),
});

// ---- Category Schemas ----

export const createCategorySchema = z.object({
  name: z.string().min(1, "Category name is required").max(50),
  sortOrder: z.number().int().min(0).default(0),
});

export const updateCategorySchema = createCategorySchema.partial();

// ---- Menu Item Schemas ----

// Per-order quantity limit. A blank number input submits "" and the dashboard
// sends null to clear a saved limit — both mean "no limit". Max mirrors
// createOrderItemSchema's quantity ceiling: a larger limit could never be met.
const orderQtyLimitSchema = z.preprocess(
  (v) => (v === "" || (typeof v === "number" && Number.isNaN(v)) ? null : v),
  z
    .number()
    .int("Quantity limits must be whole numbers")
    .min(1, "Quantity limits must be at least 1")
    .max(MAX_QTY_LIMIT, `Quantity limits cannot be more than ${MAX_QTY_LIMIT}`)
    .nullable()
    .optional()
);

const menuItemFields = z.object({
  name: z.string().min(1, "Item name is required").max(100),
  description: z.string().max(300).optional(),
  // Max mirrors the Decimal(10,2) column ceiling (99,999,999.99). Without it,
  // a larger value overflows Postgres and surfaces as an unhandled 500.
  price: z.number().positive("Price must be greater than 0").max(99999999, "Price is too large"),
  categoryId: z.string().uuid().optional().nullable(),
  imageUrl: optionalImageUrlSchema,
  prepTimeMins: z.number().int().min(1).max(120).optional().nullable(),
  minOrderQty: orderQtyLimitSchema,
  maxOrderQty: orderQtyLimitSchema,
  sortOrder: z.number().int().min(0).default(0),
  isAvailable: z.boolean().default(true),
});

// The issue is attached to maxOrderQty on purpose: a pathless issue lands in
// formErrors, which neither menu route reads.
function checkQtyLimitRange(
  data: { minOrderQty?: number | null; maxOrderQty?: number | null },
  ctx: z.RefinementCtx
) {
  const message = qtyLimitRangeError(data.minOrderQty, data.maxOrderQty);
  if (message) {
    ctx.addIssue({ code: "custom", message, path: ["maxOrderQty"] });
  }
}

// Both schemas refine the unrefined base so neither calls .partial() on an
// already-refined schema.
export const createMenuItemSchema = menuItemFields.superRefine(checkQtyLimitRange);

export const updateMenuItemSchema = menuItemFields.partial().superRefine(checkQtyLimitRange);

// ---- Order Schemas ----

export const createOrderItemSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
  specialInstructions: z.string().max(200).optional().default(""),
});

export const createOrderSchema = z.object({
  storeId: z.string().uuid(),
  customerPhone: phoneSchema,
  customerName: z
    .string()
    .min(1, "Name is required")
    .max(100),
  notes: z.string().max(500).optional(),
  items: z
    .array(createOrderItemSchema)
    .min(1, "Order must contain at least 1 item"),
  paymentMethod: z.enum(["QR", "CASH"]).default("QR"),
});

// ---- Order Status Update ----

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    "PAID",
    "ACCEPTED",
    "PREPARING",
    "READY",
    "COMPLETED",
    "CANCELLED",
  ]),
  // The status the client's board believed the order was in when the action
  // was taken. Required by the generic transition path in PATCH — it's the
  // compare-and-swap precondition that stops a stale card (SSE can lag a few
  // seconds) from applying a transition meant for a status the order has
  // since moved past. Optional here because confirmOrder's AWAITING_CONFIRMATION
  // → PAID path has its own independent CAS and ignores this field.
  expectedStatus: z
    .enum(["AWAITING_CONFIRMATION", "PAID", "ACCEPTED", "PREPARING", "READY"])
    .optional(),
});

export const orderEtaBumpSchema = z.object({
  addMins: z.number().int().min(1).max(120),
  reason: z.string().trim().max(140).optional(),
});

export const storeQueueDelaySchema = z.object({
  delayMins: z.number().int().min(0).max(180),
  reason: z.string().trim().max(140).optional(),
});

// ---- Auth Schemas ----

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters").max(100),
    email: z.string().email("Please enter a valid email"),
    phone: optionalPhoneSchema,
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

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

// ---- Admin Schemas ----

export const adminStoreStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export type AdminStoreStatusInput = z.infer<typeof adminStoreStatusSchema>;

export const adminMerchantTrialSchema = z
  .object({
    approve: z.literal(true).optional(),
    earlyBird: z.boolean().optional(),
  })
  .refine((v) => v.approve !== undefined || v.earlyBird !== undefined, {
    message: "Nothing to update",
  });

export type AdminMerchantTrialInput = z.infer<typeof adminMerchantTrialSchema>;

// ---- Inferred Types ----

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CreateOrderItemInput = z.infer<typeof createOrderItemSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type OrderEtaBumpInput = z.infer<typeof orderEtaBumpSchema>;
export type StoreQueueDelayInput = z.infer<typeof storeQueueDelaySchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
