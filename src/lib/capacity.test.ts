import { describe, it, expect } from "vitest";
import { QUEUE_ACTIVE_STATUSES, isQueueFull } from "./capacity";
import { FROZEN_ACTIVE_ORDER_STATUSES } from "./frozen";

describe("QUEUE_ACTIVE_STATUSES", () => {
  it("counts unconfirmed through preparing", () => {
    expect([...QUEUE_ACTIVE_STATUSES]).toEqual([
      "AWAITING_CONFIRMATION",
      "PAID",
      "ACCEPTED",
      "PREPARING",
    ]);
  });

  it("excludes READY — cooked orders no longer occupy the kitchen", () => {
    expect([...QUEUE_ACTIVE_STATUSES]).not.toContain("READY");
  });

  it("is deliberately not the frozen-mode list", () => {
    expect([...QUEUE_ACTIVE_STATUSES]).not.toEqual([...FROZEN_ACTIVE_ORDER_STATUSES]);
  });
});

describe("isQueueFull", () => {
  it("is not full below the cap", () => {
    expect(isQueueFull(49, 50)).toBe(false);
  });

  it("is full at exactly the cap", () => {
    expect(isQueueFull(50, 50)).toBe(true);
  });

  it("stays full past the cap", () => {
    expect(isQueueFull(51, 50)).toBe(true);
  });

  it("handles an empty queue", () => {
    expect(isQueueFull(0, 1)).toBe(false);
  });
});
