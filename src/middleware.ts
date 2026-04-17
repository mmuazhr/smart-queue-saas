// =============================================================================
// Middleware — Route Protection
// =============================================================================

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const user = req.auth?.user;

  // ---- Public Routes (no auth needed) ----
  const publicPaths = [
    "/",
    "/login",
    "/register",
    "/api/auth",
    "/api/payments/webhook",
  ];

  const isPublicPath = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(path + "/")
  );

  // Store pages are public (customer-facing)
  const isStorePath = pathname.startsWith("/store/");

  // Static assets and API queue stream are public
  const isStaticOrApi =
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/queue/stream") ||
    pathname.includes(".");

  if (isPublicPath || isStorePath || isStaticOrApi) {
    return NextResponse.next();
  }

  // ---- Protected Routes ----

  // Not logged in → redirect to login
  if (!user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin routes → ADMIN only
  if (pathname.startsWith("/admin")) {
    if (user.role !== "ADMIN") {
      return NextResponse.redirect(
        new URL("/?error=unauthorized", req.url)
      );
    }
  }

  // Dashboard routes → MERCHANT or ADMIN
  if (pathname.startsWith("/dashboard")) {
    if (user.role !== "MERCHANT" && user.role !== "ADMIN") {
      return NextResponse.redirect(
        new URL("/?error=unauthorized", req.url)
      );
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
