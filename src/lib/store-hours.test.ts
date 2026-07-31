import { describe, it, expect } from "vitest";
import { isStoreOpen, type OperatingHoursEntry } from "./store-hours";

const TZ = "Asia/Kuala_Lumpur";

const entry = (open: string, close: string, isClosed = false): OperatingHoursEntry => ({
  open,
  close,
  isClosed,
});

// Derive the weekday key the function will look up, so tests never hard-code
// a calendar weekday (which is fragile across timezones and dates).
const dayKeyIn = (d: Date, tz: string): string =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: tz }).format(d).toLowerCase();

describe("isStoreOpen", () => {
  // 2026-06-15T06:00:00Z → 14:00 in Kuala Lumpur (UTC+8)
  const klAfternoon = new Date("2026-06-15T06:00:00Z");

  it("treats null operatingHours as always open", () => {
    expect(isStoreOpen(null, klAfternoon)).toBe(true);
  });

  it("treats undefined operatingHours as always open", () => {
    expect(isStoreOpen(undefined, klAfternoon)).toBe(true);
  });

  it("is open when the current KL time falls within the day's window", () => {
    const hours = { [dayKeyIn(klAfternoon, TZ)]: entry("08:00", "22:00") };
    expect(isStoreOpen(hours, klAfternoon)).toBe(true);
  });

  it("is closed when the day's isClosed flag is set", () => {
    const hours = { [dayKeyIn(klAfternoon, TZ)]: entry("08:00", "22:00", true) };
    expect(isStoreOpen(hours, klAfternoon)).toBe(false);
  });

  it("is closed when there is no entry for the current day", () => {
    const nextDay = new Date(klAfternoon.getTime() + 24 * 60 * 60 * 1000);
    const hours = { [dayKeyIn(nextDay, TZ)]: entry("00:00", "23:59") };
    expect(isStoreOpen(hours, klAfternoon)).toBe(false);
  });

  it("is closed before opening time", () => {
    const klEarly = new Date("2026-06-14T23:30:00Z"); // 07:30 KL
    const hours = { [dayKeyIn(klEarly, TZ)]: entry("08:00", "22:00") };
    expect(isStoreOpen(hours, klEarly)).toBe(false);
  });

  it("is closed after closing time", () => {
    const klLate = new Date("2026-06-15T15:00:00Z"); // 23:00 KL
    const hours = { [dayKeyIn(klLate, TZ)]: entry("08:00", "22:00") };
    expect(isStoreOpen(hours, klLate)).toBe(false);
  });

  it("honors an explicit timezone argument", () => {
    const t = new Date("2026-06-15T06:00:00Z"); // 14:00 KL / 06:00 UTC
    const klHours = { [dayKeyIn(t, TZ)]: entry("08:00", "22:00") };
    const utcHours = { [dayKeyIn(t, "UTC")]: entry("08:00", "22:00") };
    expect(isStoreOpen(klHours, t, TZ)).toBe(true); // 14:00 within 08:00–22:00
    expect(isStoreOpen(utcHours, t, "UTC")).toBe(false); // 06:00 before 08:00
  });
});
