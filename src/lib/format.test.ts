import { describe, it, expect } from "vitest";
import { toTitleCase } from "./format";

describe("toTitleCase", () => {
  it("title-cases mixed-case input", () => {
    expect(toTitleCase("nasi GORENG cina")).toBe("Nasi Goreng Cina");
  });

  it("lower-cases an all-caps word", () => {
    expect(toTitleCase("FRIED RICE")).toBe("Fried Rice");
  });

  it("collapses extra internal and surrounding whitespace", () => {
    expect(toTitleCase("  nasi   goreng  ")).toBe("Nasi Goreng");
  });

  it("leaves a single word capitalized", () => {
    expect(toTitleCase("desserts")).toBe("Desserts");
  });

  it("title-cases a Malay multi-word category", () => {
    expect(toTitleCase("mee goreng mamak")).toBe("Mee Goreng Mamak");
  });
});
