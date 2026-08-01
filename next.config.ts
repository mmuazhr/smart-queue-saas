import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// App Router ships inline hydration scripts (`self.__next_f.push(...)`) and
// Tailwind/next-font emit inline styles, so 'unsafe-inline' is required for
// script-src and style-src — dropping it blanks the site.
// img-src hosts:
//   data:                    — the store QR is rendered as a data: URI
//   blob:                    — client-image.ts decodes uploads via an
//                              Image() pointed at an object URL
//   https://*.supabase.co    — merchant QR, menu photos, logos and payment
//                              proofs are served from the Supabase buckets
// connect-src stays 'self': the SSE stream is same-origin and Supabase is
// only ever reached server-side (storage.ts uses the service role key).
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Content-Security-Policy", value: `${CONTENT_SECURITY_POLICY};` },
];

const nextConfig: NextConfig = {
  // Keep pg/prisma out of the Next bundle to avoid bundling issues
  serverExternalPackages: [
    "@prisma/client",
    ".prisma/client",
    "@prisma/adapter-pg",
    "pg",
  ],
  // Don't advertise the framework
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
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
