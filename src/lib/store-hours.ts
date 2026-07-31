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

  const hours = operatingHours[dayName];
  if (!hours || hours.isClosed) return false;

  // Get current time as HH:MM in the target timezone (en-CA gives 24h zero-padded)
  const currentTime = new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(now);

  return currentTime >= hours.open && currentTime <= hours.close;
}
