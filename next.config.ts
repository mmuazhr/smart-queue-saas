import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Keep pg/prisma out of the Next bundle to avoid bundling issues
  serverExternalPackages: [
    "@prisma/client",
    ".prisma/client",
    "@prisma/adapter-pg",
    "pg",
  ],
};

export default withSentryConfig(nextConfig, {
  // No SENTRY_AUTH_TOKEN in this deployment — never attempt a source map
  // upload, release creation, or telemetry call during the build.
  sourcemaps: {
    disable: true,
  },
  release: {
    create: false,
  },
  telemetry: false,
  // Without an auth token, the plugin still logs a harmless
  // "No auth token provided. Will not create release." warning (verified in
  // node_modules/@sentry/bundler-plugins — it auto-detects a release name
  // from the git HEAD SHA before checking the authToken). `silent` is the
  // documented way to suppress that expected, non-actionable log line.
  silent: true,
});
