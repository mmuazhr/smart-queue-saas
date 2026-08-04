// Boundary convention under test: every branch counts down, and the wall-clock
// boundaries are the same ones the count-up version used — only the label
// changed. The green edge is strict (a READY card turns yellow the moment its
// 5-minute pickup window runs out) and the yellow edge is inclusive (5 minutes
// overdue is still yellow, 5.5 is red). An unconfirmed card is yellow through
// the last minute of its 3-minute acceptance window and red past the deadline.

import { describe, it, expect } from "vitest";
import { orderTimer } from "./order-timer";

const NOW = new Date("2026-08-03T12:00:00.000Z");

function minsBefore(mins: number): string {
  return new Date(NOW.getTime() - mins * 60_000).toISOString();
}

function minsAfter(mins: number): string {
  return new Date(NOW.getTime() + mins * 60_000).toISOString();
}

describe("orderTimer label — counting down", () => {
  const promised = (remainingMins: number) => ({
    status: "PREPARING",
    createdAt: minsBefore(20),
    estimatedReadyAt: minsAfter(remainingMins),
  });

  it("shows the remaining M:SS under an hour", () => {
    expect(orderTimer(promised(7.7), NOW).label).toBe("7:42");
  });

  it("pads the seconds", () => {
    expect(orderTimer(promised(3.05), NOW).label).toBe("3:03");
  });

  it("switches to hours and minutes at 60 minutes", () => {
    expect(orderTimer(promised(60), NOW).label).toBe("1h 0m");
    expect(orderTimer(promised(72), NOW).label).toBe("1h 12m");
  });

  it("renders an overdue card as a negative countdown", () => {
    expect(orderTimer(promised(-4.5), NOW).label).toBe("-4:30");
  });

  it("keeps the hours format when overdue by more than an hour", () => {
    expect(orderTimer(promised(-75), NOW).label).toBe("-1h 15m");
  });
});

describe("orderTimer — READY pickup window", () => {
  const ready = (mins: number) => ({
    status: "READY",
    createdAt: minsBefore(120),
    readyAt: minsBefore(mins),
  });

  it("counts down the 5-minute pickup window from readyAt", () => {
    expect(orderTimer(ready(2), NOW).label).toBe("3:00");
  });

  it("is green while pickup time is left", () => {
    expect(orderTimer(ready(4.9), NOW).tone).toBe("green");
  });

  it("is yellow from the deadline through 5 minutes overdue", () => {
    expect(orderTimer(ready(5), NOW).tone).toBe("yellow");
    expect(orderTimer(ready(10), NOW).tone).toBe("yellow");
  });

  it("is red past 5 minutes overdue", () => {
    expect(orderTimer(ready(10.5), NOW).tone).toBe("red");
    expect(orderTimer(ready(10.5), NOW).label).toBe("-5:30");
  });

  it("falls back to createdAt when readyAt is missing", () => {
    const order = { status: "READY", createdAt: minsBefore(3), readyAt: null };
    const { label, tone } = orderTimer(order, NOW);
    expect(label).toBe("2:00");
    expect(tone).toBe("green");
  });
});

describe("orderTimer — AWAITING_CONFIRMATION acceptance window", () => {
  const waiting = (mins: number) => ({
    status: "AWAITING_CONFIRMATION",
    createdAt: minsBefore(mins),
  });

  it("counts down the 3-minute acceptance window", () => {
    expect(orderTimer(waiting(0.5), NOW).label).toBe("2:30");
  });

  it("is green with more than a minute left", () => {
    expect(orderTimer(waiting(1.9), NOW).tone).toBe("green");
  });

  it("is yellow through the last minute", () => {
    expect(orderTimer(waiting(2), NOW).tone).toBe("yellow");
    expect(orderTimer(waiting(3), NOW).tone).toBe("yellow");
  });

  it("is red once the window has passed", () => {
    const { label, tone } = orderTimer(waiting(3.1), NOW);
    expect(tone).toBe("red");
    expect(label).toBe("-0:06");
  });

  // The acceptance window is the deadline that matters before confirmation —
  // an ETA on such a card (there should not be one) must not override it.
  it("ignores an estimatedReadyAt while still unconfirmed", () => {
    const order = { ...waiting(0.5), estimatedReadyAt: minsAfter(30) };
    expect(orderTimer(order, NOW).label).toBe("2:30");
  });
});

describe("orderTimer — promised ETA", () => {
  const promised = (remainingMins: number) => ({
    status: "PREPARING",
    createdAt: minsBefore(20),
    estimatedReadyAt: minsAfter(remainingMins),
  });

  it("is green with more than 5 minutes left", () => {
    expect(orderTimer(promised(6), NOW).tone).toBe("green");
  });

  it("is yellow within the last 5 minutes", () => {
    expect(orderTimer(promised(5), NOW).tone).toBe("yellow");
    expect(orderTimer(promised(0), NOW).tone).toBe("yellow");
  });

  it("is red once overdue", () => {
    expect(orderTimer(promised(-0.5), NOW).tone).toBe("red");
  });

  it("applies to PAID and ACCEPTED as well as PREPARING", () => {
    for (const status of ["PAID", "ACCEPTED"]) {
      expect(orderTimer({ ...promised(6), status }, NOW).label).toBe("6:00");
    }
  });
});

// A confirmed order should always carry an ETA; without one there is no
// deadline to count down to, so the chip ages instead of inventing a promise.
describe("orderTimer — confirmed but no ETA falls back to counting up", () => {
  const aging = (mins: number) => ({ status: "PREPARING", createdAt: minsBefore(mins) });

  it("counts up from createdAt", () => {
    expect(orderTimer(aging(7.7), NOW).label).toBe("7:42");
    expect(orderTimer(aging(72), NOW).label).toBe("1h 12m");
  });

  it("keeps the old age-based tones", () => {
    expect(orderTimer(aging(1.9), NOW).tone).toBe("green");
    expect(orderTimer(aging(2), NOW).tone).toBe("yellow");
    expect(orderTimer(aging(3), NOW).tone).toBe("yellow");
    expect(orderTimer(aging(3.1), NOW).tone).toBe("red");
  });

  it("clamps a future createdAt to zero rather than counting down", () => {
    expect(orderTimer({ status: "PREPARING", createdAt: minsAfter(5) }, NOW).label).toBe("0:00");
  });
});

describe("orderTimer on unusable dates", () => {
  it("falls back to now and green when createdAt is unparseable", () => {
    const { label, tone } = orderTimer({ status: "PREPARING", createdAt: "not a date" }, NOW);
    expect(label).toBe("0:00");
    expect(tone).toBe("green");
  });

  it("ignores an unparseable estimatedReadyAt and ages the card instead", () => {
    const order = { status: "PREPARING", createdAt: minsBefore(9), estimatedReadyAt: "nope" };
    const { label, tone } = orderTimer(order, NOW);
    expect(label).toBe("9:00");
    expect(tone).toBe("red");
  });

  it("gives an unconfirmed card its full window when createdAt is unparseable", () => {
    const { label, tone } = orderTimer(
      { status: "AWAITING_CONFIRMATION", createdAt: "not a date" },
      NOW
    );
    expect(label).toBe("3:00");
    expect(tone).toBe("green");
  });

  it("accepts Date objects as well as strings", () => {
    const order = { status: "PREPARING", createdAt: new Date(NOW.getTime() - 90_000) };
    expect(orderTimer(order, NOW).label).toBe("1:30");
  });
});
