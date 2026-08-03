// Boundary convention under test: the green edge is strict (5.0 min on a READY
// card is already yellow) and the yellow edge is inclusive (10.0 min is still
// yellow, 10.1 is red). Same shape for the other two branches.

import { describe, it, expect } from "vitest";
import { orderTimer } from "./order-timer";

const NOW = new Date("2026-08-03T12:00:00.000Z");

function minsBefore(mins: number): string {
  return new Date(NOW.getTime() - mins * 60_000).toISOString();
}

function minsAfter(mins: number): string {
  return new Date(NOW.getTime() + mins * 60_000).toISOString();
}

describe("orderTimer label", () => {
  it("shows M:SS under an hour", () => {
    const order = { status: "PREPARING", createdAt: minsBefore(7.7) };
    expect(orderTimer(order, NOW).label).toBe("7:42");
  });

  it("pads the seconds", () => {
    const order = { status: "PREPARING", createdAt: minsBefore(3.05) };
    expect(orderTimer(order, NOW).label).toBe("3:03");
  });

  it("switches to hours and minutes at 60 minutes", () => {
    expect(orderTimer({ status: "PREPARING", createdAt: minsBefore(60) }, NOW).label).toBe("1h 0m");
    expect(orderTimer({ status: "PREPARING", createdAt: minsBefore(72) }, NOW).label).toBe("1h 12m");
  });

  it("clamps a future createdAt to zero", () => {
    expect(orderTimer({ status: "PREPARING", createdAt: minsAfter(5) }, NOW).label).toBe("0:00");
  });
});

describe("orderTimer tone — READY", () => {
  const ready = (mins: number) => ({
    status: "READY",
    createdAt: minsBefore(120),
    readyAt: minsBefore(mins),
  });

  it("is green under 5 minutes on the counter", () => {
    expect(orderTimer(ready(4.9), NOW).tone).toBe("green");
  });

  it("is yellow from 5 through 10 minutes", () => {
    expect(orderTimer(ready(5), NOW).tone).toBe("yellow");
    expect(orderTimer(ready(10), NOW).tone).toBe("yellow");
  });

  it("is red past 10 minutes", () => {
    expect(orderTimer(ready(10.5), NOW).tone).toBe("red");
  });

  it("times from readyAt, not createdAt", () => {
    expect(orderTimer(ready(2), NOW).label).toBe("2:00");
  });

  it("falls back to createdAt when readyAt is missing", () => {
    const order = { status: "READY", createdAt: minsBefore(3), readyAt: null };
    const { label, tone } = orderTimer(order, NOW);
    expect(label).toBe("3:00");
    expect(tone).toBe("green");
  });
});

describe("orderTimer tone — promised ETA", () => {
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
});

describe("orderTimer tone — no ETA yet", () => {
  const waiting = (mins: number) => ({
    status: "AWAITING_CONFIRMATION",
    createdAt: minsBefore(mins),
  });

  it("is green under 3 minutes", () => {
    expect(orderTimer(waiting(2.9), NOW).tone).toBe("green");
  });

  it("is yellow from 3 through 7 minutes", () => {
    expect(orderTimer(waiting(3), NOW).tone).toBe("yellow");
    expect(orderTimer(waiting(7), NOW).tone).toBe("yellow");
  });

  it("is red past 7 minutes", () => {
    expect(orderTimer(waiting(7.5), NOW).tone).toBe("red");
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
    expect(orderTimer(order, NOW).tone).toBe("red");
  });

  it("accepts Date objects as well as strings", () => {
    const order = { status: "PREPARING", createdAt: new Date(NOW.getTime() - 90_000) };
    expect(orderTimer(order, NOW).label).toBe("1:30");
  });
});
