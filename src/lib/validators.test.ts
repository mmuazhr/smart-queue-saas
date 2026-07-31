// =============================================================================
// Validator regression tests — optional phone must accept empty form values
// =============================================================================

import { describe, it, expect } from "vitest";
import { registerSchema, createStoreSchema, phoneSchema } from "./validators";

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
