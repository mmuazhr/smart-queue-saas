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

export const DEFAULT_TIMEZONE = "Asia/Kuala_Lumpur";

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

/**
 * Whether a customer can currently place an order: the store must be within
 * operating hours AND not under an emergency pause. Both gates are checked
 * independently server-side (POST /api/orders); this is the shared source
 * of truth for the storefront/checkout UI so they can't drift from it.
 */
export function canPlaceOrder(isOpen: boolean, ordersPaused: boolean): boolean {
  return isOpen && !ordersPaused;
}

export interface NextOpening {
  day: string;   // lowercase day name, matching the operatingHours keys
  time: string;  // "HH:MM" 24h format
}

/**
 * Finds the next moment the store opens, looking forward up to 7 days.
 *
 * Returns null when the store never opens (every day closed) or when
 * operatingHours is null/undefined (always open, so there is nothing to wait for).
 *
 * @param operatingHours - Keyed by lowercase day name; null/undefined means always open
 * @param now            - Current moment (defaults to Date.now())
 * @param timeZone       - IANA timezone string (defaults to Asia/Kuala_Lumpur)
 */
export function nextOpeningTime(
  operatingHours: Record<string, OperatingHoursEntry> | null | undefined,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): NextOpening | null {
  if (!operatingHours) return null;

  const dayName = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone,
  })
    .format(now)
    .toLowerCase() as (typeof DAYS_OF_WEEK)[number];

  const currentTime = new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(now);

  const dayIndex = DAYS_OF_WEEK.indexOf(dayName);

  // Offset 0 only counts when the store has not opened yet today; offset 7 lets
  // a store that opens on a single weekday wrap around to the same day next week.
  for (let offset = 0; offset <= 7; offset++) {
    const entry = operatingHours[DAYS_OF_WEEK[(dayIndex + offset) % 7]];
    if (!entry || entry.isClosed) continue;
    if (offset === 0 && currentTime >= entry.open) continue;
    return { day: DAYS_OF_WEEK[(dayIndex + offset) % 7], time: entry.open };
  }

  return null;
}
