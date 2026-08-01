import { describe, it, expect } from "vitest";
import { openingLabel } from "./ClosedBanner";

describe("openingLabel", () => {
  it("later today", () => {
    expect(openingLabel({ day: "monday", time: "17:00" }, new Date("2026-06-14T23:30:00Z"))).toBe("Opens at 5:00pm");
  });
  it("tomorrow", () => {
    expect(openingLabel({ day: "tuesday", time: "08:00" }, new Date("2026-06-15T15:00:00Z"))).toBe("Opens tomorrow at 8:00am");
  });
  it("week away on the same weekday", () => {
    expect(openingLabel({ day: "monday", time: "08:00" }, new Date("2026-07-27T14:00:00Z"))).toBe("Opens Monday at 8:00am");
  });
  it("noon and midnight", () => {
    expect(openingLabel({ day: "monday", time: "12:00" }, new Date("2026-06-14T23:30:00Z"))).toBe("Opens at 12:00pm");
    expect(openingLabel({ day: "tuesday", time: "00:30" }, new Date("2026-06-14T23:30:00Z"))).toBe("Opens tomorrow at 12:30am");
  });
  it("null next opening", () => {
    expect(openingLabel(null)).toBe("Reopening time not available");
  });
});
