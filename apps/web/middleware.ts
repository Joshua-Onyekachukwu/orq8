import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that require authentication.
//
// `/settings` belongs here: it is the same product surface as `/app` (account,
// password, connections, provider keys) and was reachable unauthenticated while
// `/app` was not. Only `/settings/providers` guarded itself, so an anonymous
// visitor got the settings shell and had to rely on the API answering 401.
//
// Consequence, accepted deliberately: the legal pages under /settings
// (privacy-policy, terms-conditions, cookies) now require a session too. Their
// public equivalents stay at /privacy, /terms, /security and /ai-disclosure on
// the marketing site, which is where a prospect or a regulator should land.
const PROTECTED_ROUTES = ["/app", "/settings"];

// Public routes that never need auth
const PUBLIC_ROUTES = ["/", "/pricing", "/about", "/healthz"];

// Admin-only routes: require admin role in session
const ADMIN_ROUTES = ["/admin"];

function matches(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(route + "/"));
}

/**
 * Validates a ?next= target the same way the auth forms do: internal absolute
 * paths only, so the value can never smuggle an open redirect (no scheme, no
 * //host, no backslash tricks).
 */
function safeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value;
}

/**
 * Security middleware:
 * 1. Adds standard security headers to all responses
 * 2. Enforces authentication on protected routes (server-side)
 *
 * The middleware only checks that a session cookie EXISTS; validity is proven
 * by the server components (layouts and pages call /v1/auth/me with the
 * token). Because middleware never redirects authed users INTO the app on its
 * own judgment, an expired cookie cannot ping-pong between /login and /app:
 * the login page simply renders the form again instead of redirecting.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has("orq8_session");

  const response = NextResponse.next();

  // ── Security headers on every response ──
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  );

  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }

  // ── API routes are proxied to the backend; don't apply frontend auth logic ──
  if (pathname.startsWith("/api/")) {
    return response;
  }

  // ── Static/public routes: skip auth logic ──
  if (matches(pathname, PUBLIC_ROUTES)) {
    return response;
  }

  // ── Protected and admin routes: redirect to login when there is no cookie ──
  if ((matches(pathname, PROTECTED_ROUTES) || matches(pathname, ADMIN_ROUTES)) && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Auth pages (/login, /register, /onboarding): the middleware does NOT
  // redirect authenticated users away. Cookie presence proves nothing about
  // validity, and a wrong guess here is exactly what caused the old
  // /login → /app → /login redirect loop for expired sessions. The pages
  // probe /v1/auth/me themselves (no-store) and redirect only on a 200,
  // preserving ?next=. An expired cookie simply renders the form again.

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     * - API routes (handled by their own auth logic)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
