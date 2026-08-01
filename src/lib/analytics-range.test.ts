import { describe, it, expect } from "vitest";
import {
  analyticsWindowDays,
  parseAnalyticsRange,
  resolveAnalyticsWindow,
  toIsoDate,
  type AnalyticsRange,
} from "./analytics-range";

// A fixed instant mid-afternoon, so the assertions never straddle a day
// boundary regardless of the machine's timezone.
const now = new Date("2026-06-15T06:00:00Z");

const DAY_MS = 24 * 60 * 60 * 1000;
const span = (w: { start: Date; end: Date }) => w.end.getTime() - w.start.getTime();

describe("parseAnalyticsRange", () => {
  it("accepts the supported values", () => {
    expect(parseAnalyticsRange("today")).toBe("today");
    expect(parseAnalyticsRange("7d")).toBe("7d");
    expect(parseAnalyticsRange("30d")).toBe("30d");
  });

  it("falls back to today for missing or unrecognised values", () => {
    expect(parseAnalyticsRange(null)).toBe("today");
    expect(parseAnalyticsRange(undefined)).toBe("today");
    expect(parseAnalyticsRange("")).toBe("today");
    expect(parseAnalyticsRange("90d")).toBe("today");
    expect(parseAnalyticsRange("../../etc/passwd")).toBe("today");
  });
});

describe("resolveAnalyticsWindow", () => {
  const cases: { range: AnalyticsRange; dayCount: number }[] = [
    { range: "today", dayCount: 1 },
    { range: "7d", dayCount: 7 },
    { range: "30d", dayCount: 30 },
  ];

  it("reports the day count and granularity for each range", () => {
    expect(resolveAnalyticsWindow("today", now).dayCount).toBe(1);
    expect(resolveAnalyticsWindow("today", now).granularity).toBe("hourly");
    expect(resolveAnalyticsWindow("7d", now).dayCount).toBe(7);
    expect(resolveAnalyticsWindow("7d", now).granularity).toBe("daily");
    expect(resolveAnalyticsWindow("30d", now).dayCount).toBe(30);
    expect(resolveAnalyticsWindow("30d", now).granularity).toBe("daily");
  });

  it("ends the current window at the end of today for every range", () => {
    const today = resolveAnalyticsWindow("today", now);
    for (const { range } of cases) {
      expect(resolveAnalyticsWindow(range, now).current.end).toEqual(today.current.end);
    }
  });

  it("starts the current window dayCount days back, inclusive of today", () => {
    for (const { range, dayCount } of cases) {
      const w = resolveAnalyticsWindow(range, now);
      // Whole days: dayCount days minus the 1ms that endOfDay stops short of midnight.
      expect(span(w.current)).toBe(dayCount * DAY_MS - 1);
    }
  });

  it("puts the comparison window immediately before the current one", () => {
    for (const { range } of cases) {
      const w = resolveAnalyticsWindow(range, now);
      expect(w.previous.end.getTime() + 1).toBe(w.current.start.getTime());
    }
  });

  it("gives the comparison window the same length as the current one", () => {
    for (const { range } of cases) {
      const w = resolveAnalyticsWindow(range, now);
      expect(span(w.previous)).toBe(span(w.current));
    }
  });

  it("compares today against yesterday", () => {
    const w = resolveAnalyticsWindow("today", now);
    expect(toIsoDate(w.current.start)).toBe(toIsoDate(now));
    expect(toIsoDate(w.previous.start)).toBe(toIsoDate(new Date(now.getTime() - DAY_MS)));
    expect(toIsoDate(w.previous.end)).toBe(toIsoDate(new Date(now.getTime() - DAY_MS)));
  });

  it("compares 7d against the preceding 7d", () => {
    const w = resolveAnalyticsWindow("7d", now);
    expect(toIsoDate(w.current.start)).toBe(toIsoDate(new Date(now.getTime() - 6 * DAY_MS)));
    expect(toIsoDate(w.previous.start)).toBe(toIsoDate(new Date(now.getTime() - 13 * DAY_MS)));
    expect(toIsoDate(w.previous.end)).toBe(toIsoDate(new Date(now.getTime() - 7 * DAY_MS)));
  });

  it("compares 30d against the preceding 30d", () => {
    const w = resolveAnalyticsWindow("30d", now);
    expect(toIsoDate(w.current.start)).toBe(toIsoDate(new Date(now.getTime() - 29 * DAY_MS)));
    expect(toIsoDate(w.previous.start)).toBe(toIsoDate(new Date(now.getTime() - 59 * DAY_MS)));
    expect(toIsoDate(w.previous.end)).toBe(toIsoDate(new Date(now.getTime() - 30 * DAY_MS)));
  });

  it("defaults to the current time when no clock is supplied", () => {
    const w = resolveAnalyticsWindow("today");
    expect(toIsoDate(w.current.start)).toBe(toIsoDate(new Date()));
  });
});

describe("analyticsWindowDays", () => {
  it("emits one day start per series point, oldest first", () => {
    for (const dayCount of [1, 7, 30]) {
      const range: AnalyticsRange = dayCount === 1 ? "today" : dayCount === 7 ? "7d" : "30d";
      const w = resolveAnalyticsWindow(range, now);
      const days = analyticsWindowDays(w);

      expect(days).toHaveLength(dayCount);
      expect(days[0]).toEqual(w.current.start);
      expect(days.map(toIsoDate)).toEqual([...days.map(toIsoDate)].sort());
    }
  });

  it("leaves no gaps between consecutive days", () => {
    const days = analyticsWindowDays(resolveAnalyticsWindow("30d", now));
    for (let i = 1; i < days.length; i++) {
      expect(days[i].getTime() - days[i - 1].getTime()).toBe(DAY_MS);
    }
  });
});

describe("toIsoDate", () => {
  it("formats the local calendar date, not the UTC one", () => {
    const d = new Date(2026, 0, 5, 23, 30);
    expect(toIsoDate(d)).toBe("2026-01-05");
  });
});
