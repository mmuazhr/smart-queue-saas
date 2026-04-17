// =============================================================================
// Smart Queue Web System — Zod Validation Schemas
// =============================================================================

import { z } from "zod";

// ---- Phone Validation (Malaysian format) ----

export const phoneSchema = z
  .string()
  .regex(
    /^(\+?60|0)[1-9]\d{7,9}$/,
    "Please enter a valid Malaysian phone number (e.g., +60123456789 or 0123456789)"
  );

// ---- Store Schemas ----

export const createStoreSchema = z.object({
  name: z.string().min(2, "Store name must be at least 2 characters").max(100),
  description: z.string().max(500).optional(),
  phone: phoneSchema.optional(),
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
  paymentGateway: z.enum(["STRIPE", "BILLPLZ", "TOYYIBPAY"]).optional(),
  gatewayMerchantId: z.string().optional(),
});

export const updateStoreSchema = createStoreSchema.partial();

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
  imageUrl: z.string().optional().nullable(),
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
  paymentGateway: z.enum(["STRIPE", "BILLPLZ"]).optional().default("STRIPE"),
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
    phone: phoneSchema.optional(),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

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
