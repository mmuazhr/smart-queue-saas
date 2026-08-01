// Server-side Sentry init. Runs in the Node.js runtime only.
// No-op when SENTRY_DSN is unset (local dev, CI).
import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
