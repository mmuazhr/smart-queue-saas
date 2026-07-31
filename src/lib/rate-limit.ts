// =============================================================================
// In-memory sliding-window rate limiter
// NOTE: Works only in single-instance deployments.
// Multi-instance (Kubernetes, Vercel serverless) needs a shared store like Redis.
// =============================================================================

const WINDOW_MS = 60_000; // 1-minute sliding window

/** Per-key timestamp log */
const windows = new Map<string, number[]>();

/**
 * Returns true if the request is allowed, false if rate-limited.
 * @param key  - Unique identifier (e.g. IP address)
 * @param limit - Max requests allowed within the rolling window
 */
export function checkRateLimit(key: string, limit: number): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const timestamps = (windows.get(key) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= limit) {
    windows.set(key, timestamps);
    return false;
  }

  timestamps.push(now);
  windows.set(key, timestamps);
  return true;
}

/**
 * Extracts the client IP from request headers.
 * Uses the first value of x-forwarded-for; falls back to "unknown".
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return "unknown";
}
