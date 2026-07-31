import { describe, it, expect } from "vitest";
import { toPlainOrder, toPlainOrderItem, toPlainMenuItem } from "./serializers";

// Prisma Decimal stringifies to a plain string; these helpers must coerce to number.
describe("serializers", () => {
  it("converts a menu item price to a number", () => {
    const result = toPlainMenuItem({ id: "m1", name: "Burger", price: "8.50" });
    expect(result.price).toBe(8.5);
    expect(typeof result.price).toBe("number");
  });

  it("converts order-item monetary fields to numbers and preserves others", () => {
    const result = toPlainOrderItem({ id: "oi1", itemPrice: "8.50", lineTotal: "17.00", quantity: 2 });
    expect(result.itemPrice).toBe(8.5);
    expect(result.lineTotal).toBe(17);
    expect(result.quantity).toBe(2);
  });

  it("converts order monetary fields and nested order items", () => {
    const order = {
      id: "o1",
      subtotal: "17.00",
      tax: "1.02",
      total: "18.02",
      orderItems: [{ id: "oi1", itemPrice: "8.50", lineTotal: "17.00" }],
    };
    const result = toPlainOrder(order);
    expect(result.subtotal).toBe(17);
    expect(result.tax).toBe(1.02);
    expect(result.total).toBe(18.02);
    expect(result.orderItems[0].itemPrice).toBe(8.5);
    expect(typeof result.orderItems[0].lineTotal).toBe("number");
  });

  it("does not mutate the input order (immutability)", () => {
    const order = { id: "o1", subtotal: "5.00", tax: "0.30", total: "5.30", orderItems: [] };
    const result = toPlainOrder(order);
    expect(order.subtotal).toBe("5.00"); // original untouched
    expect(result).not.toBe(order);
  });

  it("leaves orderItems untouched when it is not an array", () => {
    const result = toPlainOrder({ id: "o1", subtotal: "1.00", tax: "0", total: "1.00", orderItems: undefined });
    expect(result.orderItems).toBeUndefined();
  });
});
