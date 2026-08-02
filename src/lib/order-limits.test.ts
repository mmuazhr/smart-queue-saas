// =============================================================================
// Per-order quantity limit tests — clamping, bound checks and violation
// messages shared by the storefront stepper and the order endpoint
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  cartLimitViolations,
  clampQuantity,
  initialQuantity,
  isAtMaxQuantity,
  isAtMinQuantity,
  menuItemLimitsError,
  quantityLimitHint,
  quantityLimitViolation,
  qtyLimitRangeError,
} from "./order-limits";

const noLimits = { minOrderQty: null, maxOrderQty: null };

describe("initialQuantity", () => {
  it("starts at 1 when there is no minimum", () => {
    expect(initialQuantity(noLimits)).toBe(1);
    expect(initialQuantity({})).toBe(1);
  });

  it("starts at the minimum when one is set", () => {
    expect(initialQuantity({ minOrderQty: 3 })).toBe(3);
  });
});

describe("clampQuantity", () => {
  it("leaves a quantity inside the range untouched", () => {
    expect(clampQuantity(5, { minOrderQty: 3, maxOrderQty: 10 })).toBe(5);
  });

  it("raises a quantity below the minimum", () => {
    expect(clampQuantity(1, { minOrderQty: 3 })).toBe(3);
  });

  it("caps a quantity above the maximum", () => {
    expect(clampQuantity(20, { maxOrderQty: 10 })).toBe(10);
  });

  it("keeps a floor of 1 when no limits are set", () => {
    expect(clampQuantity(4, noLimits)).toBe(4);
    expect(clampQuantity(0, noLimits)).toBe(1);
  });
});

describe("bound checks", () => {
  it("reports no bound when the limit is unset, so 1 can still step down to removal", () => {
    expect(isAtMinQuantity(1, noLimits)).toBe(false);
    expect(isAtMaxQuantity(99, noLimits)).toBe(false);
  });

  it("reports the minimum bound at or below the minimum", () => {
    expect(isAtMinQuantity(3, { minOrderQty: 3 })).toBe(true);
    expect(isAtMinQuantity(4, { minOrderQty: 3 })).toBe(false);
  });

  it("reports the maximum bound at or above the maximum", () => {
    expect(isAtMaxQuantity(10, { maxOrderQty: 10 })).toBe(true);
    expect(isAtMaxQuantity(9, { maxOrderQty: 10 })).toBe(false);
  });
});

describe("quantityLimitHint", () => {
  it("returns null when the item has no limits", () => {
    expect(quantityLimitHint(noLimits)).toBeNull();
  });

  it("omits the side that is unset", () => {
    expect(quantityLimitHint({ minOrderQty: 3 })).toBe("Min 3");
    expect(quantityLimitHint({ maxOrderQty: 10 })).toBe("Max 10");
  });

  it("shows both sides when both are set", () => {
    expect(quantityLimitHint({ minOrderQty: 3, maxOrderQty: 10 })).toBe("Min 3 · Max 10");
  });
});

describe("qtyLimitRangeError", () => {
  it("accepts a range where max is at or above min", () => {
    expect(qtyLimitRangeError(3, 3)).toBeNull();
    expect(qtyLimitRangeError(3, 10)).toBeNull();
  });

  it("rejects a max below the min", () => {
    expect(qtyLimitRangeError(5, 2)).toBeTruthy();
  });

  it("ignores the rule when either side is absent", () => {
    expect(qtyLimitRangeError(null, 2)).toBeNull();
    expect(qtyLimitRangeError(5, null)).toBeNull();
    expect(qtyLimitRangeError(undefined, undefined)).toBeNull();
  });
});

describe("menuItemLimitsError (dashboard mirror of the API rules)", () => {
  it("accepts cleared limits", () => {
    expect(menuItemLimitsError(null, null)).toBeNull();
  });

  it("rejects zero, negative and fractional bounds", () => {
    expect(menuItemLimitsError(0, null)).toBeTruthy();
    expect(menuItemLimitsError(null, -1)).toBeTruthy();
    expect(menuItemLimitsError(1.5, null)).toBeTruthy();
  });

  it("rejects bounds above the 99 order quantity ceiling", () => {
    expect(menuItemLimitsError(100, null)).toBeTruthy();
    expect(menuItemLimitsError(null, 100)).toBeTruthy();
    expect(menuItemLimitsError(1, 99)).toBeNull();
  });

  it("rejects a max below the min", () => {
    expect(menuItemLimitsError(5, 2)).toBeTruthy();
  });
});

describe("quantityLimitViolation", () => {
  it("passes a quantity inside the range", () => {
    expect(quantityLimitViolation("Satay", 5, { minOrderQty: 3, maxOrderQty: 10 })).toBeNull();
    expect(quantityLimitViolation("Satay", 3, { minOrderQty: 3, maxOrderQty: 10 })).toBeNull();
    expect(quantityLimitViolation("Satay", 10, { minOrderQty: 3, maxOrderQty: 10 })).toBeNull();
  });

  it("names the item and the minimum it broke", () => {
    expect(quantityLimitViolation("Satay", 2, { minOrderQty: 3 })).toContain("Satay");
    expect(quantityLimitViolation("Satay", 2, { minOrderQty: 3 })).toContain("minimum of 3");
  });

  it("names the item and the maximum it broke", () => {
    expect(quantityLimitViolation("Satay", 11, { maxOrderQty: 10 })).toContain("maximum of 10");
  });

  it("never fires for an item without limits", () => {
    expect(quantityLimitViolation("Satay", 99, noLimits)).toBeNull();
  });
});

describe("cartLimitViolations", () => {
  const satay = { menuItemId: "a", name: "Satay", minOrderQty: 3, maxOrderQty: 10 };

  it("returns nothing for a compliant cart", () => {
    expect(cartLimitViolations([{ ...satay, quantity: 4 }])).toEqual([]);
  });

  it("reports one message per offending item", () => {
    const messages = cartLimitViolations([
      { ...satay, quantity: 1 },
      { menuItemId: "b", name: "Teh Ais", quantity: 12, maxOrderQty: 5 },
    ]);
    expect(messages).toHaveLength(2);
  });

  it("sums repeated lines of the same item — the limit is per order, not per line", () => {
    const messages = cartLimitViolations([
      { ...satay, quantity: 6 },
      { ...satay, quantity: 6 },
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("maximum of 10");
  });

  it("clears a minimum only once the summed quantity reaches it", () => {
    expect(
      cartLimitViolations([
        { ...satay, quantity: 1 },
        { ...satay, quantity: 2 },
      ])
    ).toEqual([]);
  });
});
