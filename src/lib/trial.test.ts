import { describe, it, expect } from "vitest";
import { trialStatus, TRIAL_LENGTH_DAYS } from "./trial";

const NOW = new Date("2026-08-02T12:00:00Z");
const daysAhead = (d: number) => new Date(NOW.getTime() + d * 24 * 60 * 60 * 1000);

describe("trialStatus", () => {
  it("returns null when there is no trial", () => {
    expect(trialStatus(null, NOW)).toBeNull();
  });

  it("reports a fresh 7-day trial as full and green", () => {
    const s = trialStatus(daysAhead(7), NOW);
    expect(s).toEqual({ daysLeft: 7, fraction: 1, tone: "green", ended: false });
  });

  it("rounds partial days up and clamps the fraction", () => {
    const s = trialStatus(daysAhead(2.5), NOW)!;
    expect(s.daysLeft).toBe(3);
    expect(s.fraction).toBeCloseTo(2.5 / TRIAL_LENGTH_DAYS, 5);
    expect(s.tone).toBe("amber"); // ≤ 3 days
  });

  it("goes red on the last day", () => {
    const s = trialStatus(daysAhead(0.5), NOW)!;
    expect(s.daysLeft).toBe(1);
    expect(s.tone).toBe("red");
  });

  it("marks an expired trial as ended with zero left", () => {
    const s = trialStatus(daysAhead(-1), NOW)!;
    expect(s).toEqual({ daysLeft: 0, fraction: 0, tone: "red", ended: true });
  });
});
