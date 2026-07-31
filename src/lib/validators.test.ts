// =============================================================================
// Validator regression tests — optional phone must accept empty form values
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  registerSchema,
  createStoreSchema,
  phoneSchema,
  createMenuItemSchema,
  updateMenuItemSchema,
  updateAccountSchema,
  changePasswordSchema,
  adminStoreStatusSchema,
} from "./validators";

const baseRegister = {
  name: "Test User",
  email: "test@example.com",
  password: "password123",
  confirmPassword: "password123",
};

describe("registerSchema optional phone", () => {
  it("accepts a missing phone", () => {
    expect(registerSchema.safeParse(baseRegister).success).toBe(true);
  });

  it("accepts an empty-string phone (HTML forms submit '' for blank inputs)", () => {
    const r = registerSchema.safeParse({ ...baseRegister, phone: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.phone).toBeUndefined();
  });

  it("accepts a whitespace-only phone as absent", () => {
    expect(registerSchema.safeParse({ ...baseRegister, phone: "  " }).success).toBe(true);
  });

  it("still accepts valid Malaysian numbers", () => {
    expect(registerSchema.safeParse({ ...baseRegister, phone: "+60123456789" }).success).toBe(true);
    expect(registerSchema.safeParse({ ...baseRegister, phone: "0123456789" }).success).toBe(true);
  });

  it("still rejects invalid numbers", () => {
    expect(registerSchema.safeParse({ ...baseRegister, phone: "12345" }).success).toBe(false);
  });
});

describe("createStoreSchema optional phone", () => {
  it("accepts an empty-string phone", () => {
    expect(createStoreSchema.safeParse({ name: "My Stall", phone: "" }).success).toBe(true);
  });
});

describe("phoneSchema (required contexts unchanged)", () => {
  it("rejects empty string where a phone is required", () => {
    expect(phoneSchema.safeParse("").success).toBe(false);
  });
});

const baseMenuItem = { name: "Cheeseburger", price: 12.9 };

describe("createMenuItemSchema imageUrl", () => {
  it("accepts a missing imageUrl", () => {
    expect(createMenuItemSchema.safeParse(baseMenuItem).success).toBe(true);
  });

  it("accepts a null imageUrl", () => {
    expect(createMenuItemSchema.safeParse({ ...baseMenuItem, imageUrl: null }).success).toBe(true);
  });

  it("treats an empty-string imageUrl as absent", () => {
    const r = createMenuItemSchema.safeParse({ ...baseMenuItem, imageUrl: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.imageUrl).toBeUndefined();
  });

  it("accepts an https URL such as a Supabase public URL", () => {
    const url = "https://xyz.supabase.co/storage/v1/object/public/products/menu-items/a.png";
    const r = createMenuItemSchema.safeParse({ ...baseMenuItem, imageUrl: url });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.imageUrl).toBe(url);
  });

  it("accepts a plain http URL", () => {
    expect(
      createMenuItemSchema.safeParse({ ...baseMenuItem, imageUrl: "http://example.com/a.jpg" }).success
    ).toBe(true);
  });

  it("rejects free text mistakenly entered as an image URL", () => {
    expect(
      createMenuItemSchema.safeParse({ ...baseMenuItem, imageUrl: "Juicy beef patty with cheese" })
        .success
    ).toBe(false);
  });

  it("rejects a relative path", () => {
    expect(
      createMenuItemSchema.safeParse({ ...baseMenuItem, imageUrl: "/uploads/burger.png" }).success
    ).toBe(false);
  });

  it("rejects non-http(s) schemes", () => {
    expect(
      createMenuItemSchema.safeParse({ ...baseMenuItem, imageUrl: "javascript:alert(1)" }).success
    ).toBe(false);
  });
});

describe("updateMenuItemSchema imageUrl (partial keeps the rule)", () => {
  it("accepts an empty-string imageUrl on its own", () => {
    expect(updateMenuItemSchema.safeParse({ imageUrl: "" }).success).toBe(true);
  });

  it("still rejects free text on its own", () => {
    expect(updateMenuItemSchema.safeParse({ imageUrl: "Juicy beef patty with cheese" }).success).toBe(
      false
    );
  });
});

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

describe("adminStoreStatusSchema", () => {
  it("accepts ACTIVE and SUSPENDED", () => {
    expect(adminStoreStatusSchema.safeParse({ status: "ACTIVE" }).success).toBe(true);
    expect(adminStoreStatusSchema.safeParse({ status: "SUSPENDED" }).success).toBe(true);
  });
  it("rejects other values", () => {
    expect(adminStoreStatusSchema.safeParse({ status: "PENDING" }).success).toBe(false);
    expect(adminStoreStatusSchema.safeParse({ status: "deleted" }).success).toBe(false);
  });
});
