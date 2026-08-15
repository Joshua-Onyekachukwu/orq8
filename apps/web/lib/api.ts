import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

/**
 * Proxy a request to the ORQ8 API from a web route handler, forwarding the
 * session cookie so the API's cookie auth works (ADR-007). Returns a JSON
 * response with the upstream status — full keys never reach the browser.
 */
export async function proxyApiJson(
  request: NextRequest,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<NextResponse> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `${SESSION_COOKIE}=${token}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    return NextResponse.json(
      { error: { code: "upstream.unreachable", message: "Could not reach the ORQ8 API" } },
      { status: 502 },
    );
  }
  const data = await res.json().catch(() => null);
  return NextResponse.json(data, { status: res.status });
}
