// =============================================================================
// Logger — gates debug/info output by NODE_ENV; errors always surface
// =============================================================================

const IS_DEV = process.env.NODE_ENV !== "production";

export const logger = {
  debug: (...args: unknown[]) => {
    if (IS_DEV) console.debug("[DEBUG]", ...args);
  },
  info: (...args: unknown[]) => {
    if (IS_DEV) console.info("[INFO]", ...args);
  },
  warn: (...args: unknown[]) => {
    console.warn("[WARN]", ...args);
  },
  error: (...args: unknown[]) => {
    console.error("[ERROR]", ...args);
  },
};
