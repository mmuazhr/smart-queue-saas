// =============================================================================
// NextAuth Route Handler
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { handlers } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const RATE_LIMIT_LOGIN = 10; // 10 credential sign-in attempts per minute per IP

// next-auth v5 posts credential sign-ins to `<basePath>/callback/credentials`
// (@auth/core parseActionAndProviderId). Only that path is throttled — the
// csrf, session and signout endpoints are part of the client's own sign-in
// handshake and break if they are limited too.
const CREDENTIALS_CALLBACK = /\/callback\/credentials\/?$/;

export const { GET } = handlers;

export async function POST(request: NextRequest) {
  if (CREDENTIALS_CALLBACK.test(new URL(request.url).pathname)) {
    const ip = getClientIp(request.headers);
    if (!checkRateLimit(`login:${ip}`, RATE_LIMIT_LOGIN)) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }
  }

  // The body is left untouched so NextAuth's own form-encoded parse still sees
  // an unread stream. Account-keyed lockout would need to read it here.
  return handlers.POST(request);
}
