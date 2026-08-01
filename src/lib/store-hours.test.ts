import { describe, it, expect } from "vitest";
import { isStoreOpen, nextOpeningTime, type OperatingHoursEntry } from "./store-hours";

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

describe("overnight windows (close < open wraps past midnight)", () => {
  const overnight = {
    friday: { open: "17:00", close: "00:00", isClosed: false },
    saturday: { open: "22:00", close: "03:00", isClosed: false },
    sunday: { open: "09:00", close: "21:00", isClosed: true },
  };

  it("17:00-00:00 is open at 23:59 MYT Friday", () => {
    // 2026-07-31 is a Friday; 23:59 MYT = 15:59 UTC
    expect(isStoreOpen(overnight, new Date("2026-07-31T15:59:00Z"))).toBe(true);
  });

  it("17:00-00:00 is open exactly at midnight MYT (00:00 Saturday, Friday's close)", () => {
    // 00:00 Sat MYT = 16:00 UTC Friday
    expect(isStoreOpen(overnight, new Date("2026-07-31T16:00:00Z"))).toBe(true);
  });

  it("22:00-03:00 Saturday is open at 01:30 MYT Sunday (yesterday's spill)", () => {
    // 01:30 Sun MYT = 17:30 UTC Saturday — sunday itself is closed, but
    // saturday's window spills past midnight
    expect(isStoreOpen(overnight, new Date("2026-08-01T17:30:00Z"))).toBe(true);
  });

  it("22:00-03:00 Saturday is closed at 04:00 MYT Sunday (spill ended)", () => {
    expect(isStoreOpen(overnight, new Date("2026-08-01T20:00:00Z"))).toBe(false);
  });

  it("17:00-00:00 is closed at 12:00 MYT Friday (before opening)", () => {
    expect(isStoreOpen(overnight, new Date("2026-07-31T04:00:00Z"))).toBe(false);
  });
});

describe("nextOpeningTime", () => {
  // Offset a moment by whole days so the weekday key can be derived, never guessed.
  const daysAfter = (d: Date, n: number): Date => new Date(d.getTime() + n * 24 * 60 * 60 * 1000);

  it("returns null for null operatingHours (always open)", () => {
    expect(nextOpeningTime(null, new Date("2026-06-15T06:00:00Z"))).toBeNull();
  });

  it("returns null for undefined operatingHours (always open)", () => {
    expect(nextOpeningTime(undefined, new Date("2026-06-15T06:00:00Z"))).toBeNull();
  });

  it("returns null when every day is marked isClosed", () => {
    const now = new Date("2026-06-15T06:00:00Z");
    const hours = Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => [dayKeyIn(daysAfter(now, i), TZ), entry("08:00", "22:00", true)])
    );
    expect(nextOpeningTime(hours, now)).toBeNull();
  });

  it("returns today when the store opens later today", () => {
    const klEarly = new Date("2026-06-14T23:30:00Z"); // 07:30 KL
    const hours = { [dayKeyIn(klEarly, TZ)]: entry("08:00", "22:00") };
    expect(nextOpeningTime(hours, klEarly)).toEqual({ day: dayKeyIn(klEarly, TZ), time: "08:00" });
  });

  it("returns tomorrow once today's opening time has passed", () => {
    const klLate = new Date("2026-06-15T15:00:00Z"); // 23:00 KL
    const hours = {
      [dayKeyIn(klLate, TZ)]: entry("08:00", "22:00"),
      [dayKeyIn(daysAfter(klLate, 1), TZ)]: entry("09:00", "17:00"),
    };
    expect(nextOpeningTime(hours, klLate)).toEqual({
      day: dayKeyIn(daysAfter(klLate, 1), TZ),
      time: "09:00",
    });
  });

  it("skips closed days to reach the next open one", () => {
    const now = new Date("2026-06-15T06:00:00Z"); // 14:00 KL
    const hours = {
      [dayKeyIn(now, TZ)]: entry("08:00", "22:00", true),
      [dayKeyIn(daysAfter(now, 1), TZ)]: entry("08:00", "22:00", true),
      [dayKeyIn(daysAfter(now, 2), TZ)]: entry("10:30", "20:00"),
    };
    expect(nextOpeningTime(hours, now)).toEqual({
      day: dayKeyIn(daysAfter(now, 2), TZ),
      time: "10:30",
    });
  });

  it("wraps around the week when only one distant day is open", () => {
    // 2026-07-28 is a Tuesday in KL; the only open day is Monday.
    const klTuesday = new Date("2026-07-28T06:00:00Z");
    expect(dayKeyIn(klTuesday, TZ)).toBe("tuesday");
    expect(nextOpeningTime({ monday: entry("08:00", "22:00") }, klTuesday)).toEqual({
      day: "monday",
      time: "08:00",
    });
  });

  it("wraps a full week when the only open day is today but its opening time has passed", () => {
    // 2026-07-27 is a Monday in KL; 22:00 KL is past the 08:00 opening.
    const klMondayNight = new Date("2026-07-27T14:00:00Z");
    expect(dayKeyIn(klMondayNight, TZ)).toBe("monday");
    expect(nextOpeningTime({ monday: entry("08:00", "22:00") }, klMondayNight)).toEqual({
      day: "monday",
      time: "08:00",
    });
  });

  it("honors an explicit timezone argument", () => {
    const t = new Date("2026-06-15T06:00:00Z"); // 14:00 KL / 06:00 UTC
    const utcHours = { [dayKeyIn(t, "UTC")]: entry("08:00", "22:00") };
    // 06:00 UTC is still before the 08:00 opening, so it opens later the same day.
    expect(nextOpeningTime(utcHours, t, "UTC")).toEqual({ day: dayKeyIn(t, "UTC"), time: "08:00" });
  });
});
