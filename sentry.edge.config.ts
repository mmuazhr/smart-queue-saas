// Edge-runtime Sentry init. Covers middleware (src/middleware.ts runs on the
// Edge runtime by default) and any edge route handlers.
// No-op when SENTRY_DSN is unset (local dev, CI).
import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
