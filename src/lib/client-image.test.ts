import { describe, it, expect } from "vitest";
import { targetDimensions } from "./client-image";

describe("targetDimensions", () => {
  it("downscales a landscape image to fit the longest edge", () => {
    expect(targetDimensions(3000, 2000, 1600)).toEqual({ width: 1600, height: 1067 });
  });

  it("downscales a portrait image to fit the longest edge", () => {
    expect(targetDimensions(2000, 3000, 1600)).toEqual({ width: 1067, height: 1600 });
  });

  it("never upscales an image already under the max", () => {
    expect(targetDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("leaves dimensions unchanged when exactly at the max", () => {
    expect(targetDimensions(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });
});
