import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// TEMPORARY — Sentry live-capture verification. Delete after confirming the event.
export async function GET() {
  throw new Error("sentry-live-capture-test");
  return NextResponse.json({ ok: true }); // unreachable
}
