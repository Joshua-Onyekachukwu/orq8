import type { NextResponse } from "next/server";

// Server-side helpers for talking to the ORQ8 API (docs/06, 35).
// Sessions are server-side opaque tokens (ADR-007). The API accepts the token
// as `Authorization: Bearer` OR as the `orq8_session` httpOnly cookie — the web
// app uses the cookie path and never exposes tokens to the browser.

export const SESSION_COOKIE = "orq8_session";

// Matches packages/auth SESSION_TTL_MS (30 days) so the cookie lives as long as the session.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Server-to-server calls use API_URL (e.g. http://orq8-api:3001 in containers);
// fall back to the public var, then localhost for bare `pnpm dev` runs.
export const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

/** Attach the session token as an httpOnly cookie on a route-handler response. */
export function attachSessionCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return response;
}

/** Pull the human-readable message out of the API's error envelope ({ error: { code, message } }). */
export function parseApiError(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const message = (data as { error?: { message?: unknown } }).error?.message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return fallback;
}
