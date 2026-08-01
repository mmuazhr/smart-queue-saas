// =============================================================================
// Analytics Range Windows — pure, timezone-consistent date helpers
// =============================================================================
// Day boundaries come from date-fns (server-local), matching how the analytics
// route has always derived "today". Every range is the same shape: N whole days
// ending with today, compared against the N whole days immediately before it,
// so "today" is just the N = 1 case.

import { startOfDay, endOfDay, subDays } from "date-fns";

export type AnalyticsRange = "today" | "7d" | "30d";
export type AnalyticsGranularity = "hourly" | "daily";

const RANGE_DAYS: Record<AnalyticsRange, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
};

export interface DateWindow {
  start: Date;
  end: Date;
}

export interface AnalyticsWindow {
  range: AnalyticsRange;
  granularity: AnalyticsGranularity;
  dayCount: number;
  current: DateWindow;
  previous: DateWindow;
}

/** Coerces an untrusted query param to a supported range; anything else is "today". */
export function parseAnalyticsRange(value: string | null | undefined): AnalyticsRange {
  return value === "7d" || value === "30d" ? value : "today";
}

/**
 * Resolves the selected window plus the equal-length window immediately
 * preceding it (used for the % change metric).
 */
export function resolveAnalyticsWindow(
  range: AnalyticsRange,
  now: Date = new Date()
): AnalyticsWindow {
  const dayCount = RANGE_DAYS[range];

  return {
    range,
    granularity: range === "today" ? "hourly" : "daily",
    dayCount,
    current: {
      start: startOfDay(subDays(now, dayCount - 1)),
      end: endOfDay(now),
    },
    previous: {
      start: startOfDay(subDays(now, dayCount * 2 - 1)),
      end: endOfDay(subDays(now, dayCount)),
    },
  };
}

/** Day starts covered by the current window, oldest first — one per series point. */
export function analyticsWindowDays(window: AnalyticsWindow): Date[] {
  return Array.from({ length: window.dayCount }, (_, i) =>
    startOfDay(subDays(window.current.end, window.dayCount - 1 - i))
  );
}

/** Local-calendar ISO date ("YYYY-MM-DD"); never UTC-shifted like toISOString(). */
export function toIsoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
