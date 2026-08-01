import { describe, it, expect } from "vitest";
import { formatAge, DANGER_MS } from "./OrderAgeBadge";

describe("formatAge", () => {
  it("formats sub-minute elapsed time", () => {
    expect(formatAge(5_000)).toEqual({ label: "0:05", danger: false });
  });
  it("formats minutes and seconds, zero-padded", () => {
    expect(formatAge(65_000)).toEqual({ label: "1:05", danger: false });
  });
  it("clamps negative elapsed (clock skew) to zero", () => {
    expect(formatAge(-500)).toEqual({ label: "0:00", danger: false });
  });
  it("is not danger exactly at the threshold", () => {
    expect(formatAge(DANGER_MS).danger).toBe(false);
  });
  it("is danger just past the threshold", () => {
    expect(formatAge(DANGER_MS + 1).danger).toBe(true);
  });
  it("respects a custom danger threshold", () => {
    expect(formatAge(11_000, 10_000).danger).toBe(true);
    expect(formatAge(9_000, 10_000).danger).toBe(false);
  });
});
