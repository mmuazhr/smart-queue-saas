import { describe, it, expect } from "vitest";
import {
  computeStoreStats,
  computeEtaMins,
  projectReadyAt,
  shouldRevise,
  isDelayed,
  remainingMins,
  MIN_THROUGHPUT_SAMPLES,
} from "./eta";

const NOW = new Date("2026-08-02T12:00:00Z");
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const minsAhead = (m: number) => new Date(NOW.getTime() + m * 60_000);

describe("computeStoreStats", () => {
  it("returns null stats below the sample floor", () => {
    const stats = computeStoreStats(
      [{ readyAt: minsAgo(5), startedAt: minsAgo(13) }],
      NOW
    );
    expect(stats.throughputPerMin).toBeNull();
    expect(stats.avgPrepMins).toBeNull();
    expect(stats.samples).toBe(1);
  });

  it("computes throughput and avg prep from recent READY orders", () => {
    // 4 orders went READY over the last 30 min, each took 8 min to prep
    const readyOrders = [30, 20, 10, 5].map((m) => ({
      readyAt: minsAgo(m),
      startedAt: minsAgo(m + 8),
    }));
    const stats = computeStoreStats(readyOrders, NOW);
    expect(stats.samples).toBe(4);
    // 4 orders over a 30-minute span
    expect(stats.throughputPerMin).toBeCloseTo(4 / 30, 5);
    expect(stats.avgPrepMins).toBeCloseTo(8, 5);
  });

  it("ignores orders readied outside the 60-minute window", () => {
    const readyOrders = [
      { readyAt: minsAgo(90), startedAt: minsAgo(100) },
      { readyAt: minsAgo(10), startedAt: minsAgo(18) },
    ];
    const stats = computeStoreStats(readyOrders, NOW);
    expect(stats.samples).toBe(1);
    expect(stats.throughputPerMin).toBeNull();
  });

  it("clamps negative prep durations to zero contribution", () => {
    const readyOrders = [10, 8, 6].map((m) => ({
      readyAt: minsAgo(m),
      startedAt: minsAgo(m - 1), // startedAt AFTER readyAt (bad data)
    }));
    const stats = computeStoreStats(readyOrders, NOW);
    // avg clamps up to the 1-minute floor rather than going negative
    expect(stats.avgPrepMins).toBeGreaterThanOrEqual(1);
  });
});

describe("computeEtaMins", () => {
  const stats = { throughputPerMin: 0.4, avgPrepMins: 8, samples: 5 }; // 1 order per 2.5 min

  it("uses throughput for queue clearance plus own prep", () => {
    // 4 ahead ÷ 0.4/min = 10 min clearance + 8 prep = 18
    expect(
      computeEtaMins({ ordersAhead: 4, stats, fallbackPrepMins: 10, maxConcurrentOrders: 5 })
    ).toBe(18);
  });

  it("falls back to batch model when throughput is unknown", () => {
    const cold = { throughputPerMin: null, avgPrepMins: null, samples: 0 };
    // ceil(4/5) = 1 batch × 10 + 10 own prep = 20
    expect(
      computeEtaMins({ ordersAhead: 4, stats: cold, fallbackPrepMins: 10, maxConcurrentOrders: 5 })
    ).toBe(20);
  });

  it("adds manual and store-wide delays", () => {
    expect(
      computeEtaMins({
        ordersAhead: 0, stats, fallbackPrepMins: 10, maxConcurrentOrders: 5,
        etaAdjustMins: 20, queueDelayMins: 10,
      })
    ).toBe(38); // 0 clearance + 8 prep + 20 + 10
  });

  it("never returns less than 1 minute", () => {
    const cold = { throughputPerMin: null, avgPrepMins: null, samples: 0 };
    expect(
      computeEtaMins({ ordersAhead: 0, stats: cold, fallbackPrepMins: 0, maxConcurrentOrders: 5 })
    ).toBe(1);
  });
});

describe("projectReadyAt", () => {
  const stats = { throughputPerMin: 0.5, avgPrepMins: 10, samples: 5 };

  it("projects from preparingAt for orders already cooking", () => {
    const order = { status: "PREPARING", preparingAt: minsAgo(4), etaAdjustMins: 0 };
    const projected = projectReadyAt(order, 0, stats, 10, 5, NOW);
    // started 4 min ago + 10 min avg prep = 6 min from now
    expect(projected.getTime()).toBe(minsAhead(6).getTime());
  });

  it("never projects a cooking order earlier than one minute from now", () => {
    const order = { status: "PREPARING", preparingAt: minsAgo(30), etaAdjustMins: 0 };
    const projected = projectReadyAt(order, 0, stats, 10, 5, NOW);
    expect(projected.getTime()).toBe(minsAhead(1).getTime());
  });

  it("projects queued orders through the full estimate", () => {
    const order = { status: "PAID", preparingAt: null, etaAdjustMins: 0 };
    const projected = projectReadyAt(order, 2, stats, 10, 5, NOW);
    // 2 ÷ 0.5 = 4 clearance + 10 prep = 14 min
    expect(projected.getTime()).toBe(minsAhead(14).getTime());
  });
});

describe("shouldRevise", () => {
  it("does not revise inside the max(3 min, 20%) threshold", () => {
    // original promise 10 min → threshold is max(3, 2) = 3 min
    expect(shouldRevise(minsAhead(5), minsAhead(7), 10)).toBe(false);
    expect(shouldRevise(minsAhead(5), minsAhead(8), 10)).toBe(false); // exactly 3 — not over
  });

  it("revises when drift exceeds the threshold", () => {
    expect(shouldRevise(minsAhead(5), minsAhead(9), 10)).toBe(true);
  });

  it("uses the 20% arm for long original estimates", () => {
    // original 30 min → threshold 6 min
    expect(shouldRevise(minsAhead(5), minsAhead(10), 30)).toBe(false);
    expect(shouldRevise(minsAhead(5), minsAhead(12), 30)).toBe(true);
  });
});

describe("isDelayed", () => {
  it("is false when the promise never moved", () => {
    // confirmed 5 min ago with a 15-minute promise, still promised at +10
    expect(isDelayed(minsAgo(5), 15, minsAhead(10))).toBe(false);
  });

  it("is true once the current promise exceeds the original by over a minute", () => {
    expect(isDelayed(minsAgo(5), 15, minsAhead(20))).toBe(true);
  });

  it("is false when any input is missing", () => {
    expect(isDelayed(null, 15, minsAhead(20))).toBe(false);
    expect(isDelayed(minsAgo(5), null, minsAhead(20))).toBe(false);
    expect(isDelayed(minsAgo(5), 15, null)).toBe(false);
  });
});

describe("remainingMins", () => {
  it("rounds up and clamps at zero", () => {
    expect(remainingMins(new Date(NOW.getTime() + 90_000), NOW)).toBe(2);
    expect(remainingMins(minsAgo(5), NOW)).toBe(0);
  });
});

describe("constants", () => {
  it("requires at least 3 samples", () => {
    expect(MIN_THROUGHPUT_SAMPLES).toBe(3);
  });
});
