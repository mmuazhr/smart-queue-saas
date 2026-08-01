// Next.js instrumentation hook (stable since v15). `register` runs once per
// server instance; `onRequestError` reports uncaught server errors (Route
// Handlers, Server Components, Server Actions) to Sentry. Both are no-ops
// when SENTRY_DSN is unset, since the imported config files guard their init.
import type { Instrumentation } from "next";
import * as Sentry from "@sentry/nextjs";

const PROOF_SWEEP_INITIAL_DELAY_MS = 5 * 60 * 1000;
const PROOF_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    // Payment-proof retention sweep. Single-replica deployment is a documented
    // invariant, so an in-process interval (rather than a cron endpoint or a
    // separate service) is the chosen design. Delay the first run so it
    // doesn't compete with cold start.
    const { sweepExpiredProofs } = await import("./lib/proof-retention");
    const { logger } = await import("./lib/logger");
    const runSweep = () => {
      sweepExpiredProofs().catch((error: unknown) => {
        logger.error("[proof-retention] sweep rejected unexpectedly", error);
      });
    };
    setTimeout(runSweep, PROOF_SWEEP_INITIAL_DELAY_MS);
    setInterval(runSweep, PROOF_SWEEP_INTERVAL_MS);
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError: Instrumentation.onRequestError =
  Sentry.captureRequestError;
