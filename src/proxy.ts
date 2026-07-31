// =============================================================================
// Proxy — Route Protection  (Next.js 16: middleware.ts → proxy.ts)
// =============================================================================

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Paths that never require authentication
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/api/auth",
  "/api/webhooks",  // all provider webhooks (was /api/payments/webhook — wrong path)
  "/api/orders",    // anonymous customer checkout + order tracking
  "/api/queue/stream",
] as const;

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const user = req.auth?.user;

  const isPublicPath = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  // Store pages are always public (customer-facing)
  const isStorePath = pathname.startsWith("/store/");

  // Only _next/* static assets bypass auth — NOT generic dots
  const isNextStatic =
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/public/");

  // Root-level files served from /public (hero image, app icon, sw.js).
  // Single path segment + known-safe extension only, so nested app routes
  // like /dashboard/foo.png still require auth.
  const isPublicFile =
    /^\/[\w.-]+\.(png|jpe?g|webp|gif|svg|ico|js|json|txt|xml|webmanifest)$/.test(
      pathname
    );

  if (isPublicPath || isStorePath || isNextStatic || isPublicFile) {
    return NextResponse.next();
  }

  if (!user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/admin") && user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/?error=unauthorized", req.url));
  }

  if (
    pathname.startsWith("/dashboard") &&
    user.role !== "MERCHANT" &&
    user.role !== "ADMIN"
  ) {
    return NextResponse.redirect(new URL("/?error=unauthorized", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
