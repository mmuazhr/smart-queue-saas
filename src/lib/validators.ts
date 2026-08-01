// =============================================================================
// Smart Queue Web System — Zod Validation Schemas
// =============================================================================

import { z } from "zod";
import { isHttpUrl } from "./utils";

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
  paymentQrUrl: z.string().url().optional(),
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

// ---- Menu Item Schemas ----

export const createMenuItemSchema = z.object({
  name: z.string().min(1, "Item name is required").max(100),
  description: z.string().max(300).optional(),
  price: z.number().positive("Price must be greater than 0"),
  categoryId: z.string().uuid().optional().nullable(),
  imageUrl: optionalImageUrlSchema,
  prepTimeMins: z.number().int().min(1).max(120).optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
  isAvailable: z.boolean().default(true),
});

export const updateMenuItemSchema = createMenuItemSchema.partial();

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

// ---- Inferred Types ----

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CreateOrderItemInput = z.infer<typeof createOrderItemSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
