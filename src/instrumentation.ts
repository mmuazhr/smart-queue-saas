// Next.js instrumentation hook (stable since v15). `register` runs once per
// server instance; `onRequestError` reports uncaught server errors (Route
// Handlers, Server Components, Server Actions) to Sentry. Both are no-ops
// when SENTRY_DSN is unset, since the imported config files guard their init.
import type { Instrumentation } from "next";
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError: Instrumentation.onRequestError =
  Sentry.captureRequestError;
