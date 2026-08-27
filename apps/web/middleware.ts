import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that require authentication
const PROTECTED_ROUTES = ["/app"];

// Routes that should redirect to /app if already authenticated
const AUTH_ROUTES = ["/login", "/register", "/onboarding"];

// Public routes that never need auth
const PUBLIC_ROUTES = ["/", "/pricing", "/about", "/healthz"];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

// Admin-only routes: require admin role in session
const ADMIN_ROUTES = ["/admin"];

function isAdminRoute(pathname: string): boolean {
  return ADMIN_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

/**
 * Security middleware:
 * 1. Adds standard security headers to all responses
 * 2. Enforces authentication on protected routes (server-side)
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
  if (isPublicRoute(pathname)) {
    return response;
  }

  // ── Protected routes: redirect to login if no session cookie ──
  if (isProtectedRoute(pathname) && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Admin routes: check for admin session cookie ──
  // Admin role is verified server-side in the admin layout; the middleware
  // only ensures a session exists. The admin layout then calls /v1/auth/me
  // and checks the role before rendering any admin content.
  if (isAdminRoute(pathname) && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Auth routes: redirect to /app if already authenticated ──
  if (isAuthRoute(pathname) && hasSession) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

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
