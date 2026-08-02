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

describe("menu item order quantity limits", () => {
  it("accepts an item with no limits", () => {
    const r = createMenuItemSchema.safeParse(baseMenuItem);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.minOrderQty).toBeUndefined();
      expect(r.data.maxOrderQty).toBeUndefined();
    }
  });

  it("accepts whole numbers on both sides", () => {
    const r = createMenuItemSchema.safeParse({ ...baseMenuItem, minOrderQty: 3, maxOrderQty: 10 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.minOrderQty).toBe(3);
  });

  it("treats null and an empty input as clearing the limit", () => {
    const r = createMenuItemSchema.safeParse({ ...baseMenuItem, minOrderQty: null, maxOrderQty: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.minOrderQty).toBeNull();
      expect(r.data.maxOrderQty).toBeNull();
    }
  });

  it("rejects zero, negative and fractional limits", () => {
    expect(createMenuItemSchema.safeParse({ ...baseMenuItem, minOrderQty: 0 }).success).toBe(false);
    expect(createMenuItemSchema.safeParse({ ...baseMenuItem, maxOrderQty: -2 }).success).toBe(false);
    expect(createMenuItemSchema.safeParse({ ...baseMenuItem, minOrderQty: 2.5 }).success).toBe(false);
  });

  it("rejects a limit above the 99 order quantity ceiling", () => {
    expect(createMenuItemSchema.safeParse({ ...baseMenuItem, minOrderQty: 100 }).success).toBe(false);
    expect(createMenuItemSchema.safeParse({ ...baseMenuItem, maxOrderQty: 99 }).success).toBe(true);
  });

  it("rejects a max below the min and reports it on the maxOrderQty field", () => {
    const r = createMenuItemSchema.safeParse({ ...baseMenuItem, minOrderQty: 5, maxOrderQty: 2 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["maxOrderQty"]);
  });

  it("accepts a max equal to the min", () => {
    expect(
      createMenuItemSchema.safeParse({ ...baseMenuItem, minOrderQty: 4, maxOrderQty: 4 }).success
    ).toBe(true);
  });

  it("keeps the rules on a partial update", () => {
    expect(updateMenuItemSchema.safeParse({ minOrderQty: 3 }).success).toBe(true);
    expect(updateMenuItemSchema.safeParse({ maxOrderQty: null }).success).toBe(true);
    expect(updateMenuItemSchema.safeParse({ minOrderQty: 0 }).success).toBe(false);
    expect(updateMenuItemSchema.safeParse({ minOrderQty: 5, maxOrderQty: 2 }).success).toBe(false);
  });

  it("surfaces the cross-field message through flatten().fieldErrors, which the PUT route reads", () => {
    const r = updateMenuItemSchema.safeParse({ minOrderQty: 5, maxOrderQty: 2 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.maxOrderQty?.length).toBeGreaterThan(0);
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
