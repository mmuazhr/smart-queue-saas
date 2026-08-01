import { describe, it, expect } from "vitest";
import { computeCharges, parseStoreCharges, subtotalCentsFromItems, computeCartCharges } from "./charges";

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

describe("subtotalCentsFromItems", () => {
  it("rounds each line's unit price to cents before multiplying by quantity", () => {
    // Mirrors api/orders/route.ts's per-line rounding exactly, so a cart
    // preview built from this never drifts a cent from the created order.
    expect(subtotalCentsFromItems([{ price: 8.5, quantity: 1 }])).toBe(850);
    expect(subtotalCentsFromItems([{ price: 6, quantity: 2 }])).toBe(1200);
    expect(subtotalCentsFromItems([])).toBe(0);
  });
});

describe("computeCartCharges", () => {
  it("derives subtotal, lines, and total straight from computeCharges/parseStoreCharges", () => {
    const result = computeCartCharges(
      [{ price: 8.5, quantity: 1 }],
      [{ label: "SST", rate: 6, enabled: true }]
    );
    expect(result.subtotalCents).toBe(850);
    expect(result.lines).toEqual([{ label: "SST", rate: 6, amountCents: 51 }]);
    expect(result.totalCents).toBe(901);
  });

  it("a disabled charge contributes nothing — total equals the subtotal", () => {
    const result = computeCartCharges(
      [{ price: 6, quantity: 1 }],
      [{ label: "SST", rate: 6, enabled: false }]
    );
    expect(result.lines).toEqual([]);
    expect(result.totalCents).toBe(result.subtotalCents);
  });

  it("multiple enabled charges apply flat, never compounding", () => {
    const result = computeCartCharges(
      [{ price: 100, quantity: 1 }],
      [
        { label: "SST", rate: 6, enabled: true },
        { label: "Service", rate: 10, enabled: true },
      ]
    );
    expect(result.chargeTotalCents).toBe(1600); // NOT 1660
    expect(result.totalCents).toBe(11600);
  });

  it("degrades to subtotal-only for invalid/missing raw charges", () => {
    const result = computeCartCharges([{ price: 6, quantity: 1 }], null);
    expect(result.lines).toEqual([]);
    expect(result.totalCents).toBe(600);
  });
});
