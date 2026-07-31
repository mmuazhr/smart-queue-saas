// =============================================================================
// Store Operating Hours — pure, timezone-aware helper
// =============================================================================

export interface OperatingHoursEntry {
  open: string;   // "HH:MM" 24h format
  close: string;  // "HH:MM" 24h format
  isClosed: boolean;
}

const DAYS_OF_WEEK = [
  "sunday", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday",
] as const;

const DEFAULT_TIMEZONE = "Asia/Kuala_Lumpur";

/**
 * Determines whether a store is currently open.
 *
 * @param operatingHours - Keyed by lowercase day name; null/undefined means always open
 * @param now            - Current moment (defaults to Date.now())
 * @param timeZone       - IANA timezone string (defaults to Asia/Kuala_Lumpur)
 */
export function isStoreOpen(
  operatingHours: Record<string, OperatingHoursEntry> | null | undefined,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): boolean {
  if (!operatingHours) return true;

  const dayName = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone,
  })
    .format(now)
    .toLowerCase() as (typeof DAYS_OF_WEEK)[number];

  // Get current time as HH:MM in the target timezone (en-CA gives 24h zero-padded)
  const currentTime = new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(now);

  const withinWindow = (entry: OperatingHoursEntry): boolean => {
    if (entry.isClosed) return false;
    if (entry.close < entry.open) {
      // Overnight window (e.g. 17:00–00:00, 22:00–03:00): the same-day part.
      // "00:00" as close means exactly midnight and only matches the spill check.
      return currentTime >= entry.open;
    }
    return currentTime >= entry.open && currentTime <= entry.close;
  };

  const hours = operatingHours[dayName];
  if (hours && withinWindow(hours)) return true;

  // Yesterday's overnight window can spill into the small hours of today
  // (a stall open Sat 22:00–03:00 is still open at 01:30 Sunday).
  const dayIndex = DAYS_OF_WEEK.indexOf(dayName);
  const yesterdayName = DAYS_OF_WEEK[(dayIndex + 6) % 7];
  const yesterday = operatingHours[yesterdayName];
  if (
    yesterday &&
    !yesterday.isClosed &&
    yesterday.close < yesterday.open &&
    currentTime <= yesterday.close
  ) {
    return true;
  }

  return false;
}
