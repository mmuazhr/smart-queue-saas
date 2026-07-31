import { describe, it, expect, vi } from "vitest";
import { checkRateLimit, getClientIp } from "./rate-limit";

const uniqueKey = (label: string): string => `${label}-${Math.random()}-${Date.now()}`;

describe("checkRateLimit", () => {
  it("allows requests up to the limit", () => {
    const key = uniqueKey("under");
    expect(checkRateLimit(key, 3)).toBe(true);
    expect(checkRateLimit(key, 3)).toBe(true);
    expect(checkRateLimit(key, 3)).toBe(true);
  });

  it("blocks the request that exceeds the limit", () => {
    const key = uniqueKey("over");
    checkRateLimit(key, 2);
    checkRateLimit(key, 2);
    expect(checkRateLimit(key, 2)).toBe(false);
  });

  it("tracks limits independently per key", () => {
    const a = uniqueKey("a");
    const b = uniqueKey("b");
    expect(checkRateLimit(a, 1)).toBe(true);
    expect(checkRateLimit(a, 1)).toBe(false);
    expect(checkRateLimit(b, 1)).toBe(true); // b unaffected by a's exhaustion
  });

  it("slides the window — allows again once the window has passed", () => {
    vi.useFakeTimers();
    try {
      const key = uniqueKey("slide");
      expect(checkRateLimit(key, 1)).toBe(true);
      expect(checkRateLimit(key, 1)).toBe(false);
      vi.advanceTimersByTime(61_000); // advance past the 60s window
      expect(checkRateLimit(key, 1)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("getClientIp", () => {
  it("returns the first IP from x-forwarded-for", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178",
    });
    expect(getClientIp(headers)).toBe("203.0.113.5");
  });

  it("trims whitespace around the forwarded IP", () => {
    const headers = new Headers({ "x-forwarded-for": "  198.51.100.7  , 10.0.0.1" });
    expect(getClientIp(headers)).toBe("198.51.100.7");
  });

  it("falls back to 'unknown' when the header is absent", () => {
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});
