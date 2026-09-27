import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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

/**
 * Shape check for the one-time OAuth session token that travels through the
 * callback URL. Sessions are 32 random bytes as base64url (packages/auth);
 * anything else is not a token and must not touch the cookie jar.
 */
export function safeOauthToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{40,120}$/.test(value);
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
 * Build auth headers for proxying to the Fastify backend.
 * Uses Authorization: Bearer <token> instead of cookie forwarding.
 * This is critical for cross-domain deployments (Vercel → Railway):
 * 1. Cookie-based auth fails because the cookie domain differs
 * 2. Bearer auth is CSRF-exempt on the backend (ADR-007)
 * 3. The session token is the same — it's just passed in a header
 */
export function proxyAuthHeaders(
  token: string | undefined,
  contentType?: string,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (contentType) headers["content-type"] = contentType;
  return headers;
}

/**
 * Proxy a request to the ORQ8 API from a web route handler.
 */
export async function proxyApiJson(
  request: NextRequest,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<NextResponse> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      // A hung API must not hang the web route with it (infinite spinner).
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return NextResponse.json(
      {
        error: {
          code: timedOut ? "upstream.timeout" : "upstream.unreachable",
          message: timedOut
            ? "The ORQ8 API took too long to respond"
            : "Could not reach the ORQ8 API",
        },
      },
      { status: timedOut ? 504 : 502 },
    );
  }
  const data = await res.json().catch(() => null);
  // For GET requests, add Cache-Control so the browser doesn't re-fetch
  // the same data on every client-side navigation. s-maxage=30 means
  // Vercel's edge cache holds it for 30s; stale-while-revalidate keeps
  // the UI responsive while the cache refreshes in the background.
  const isRead = !init.method || init.method === 'GET';
  const response = NextResponse.json(data, { status: res.status });
  if (isRead) {
    response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  }
  return response;
}

// ─── Server-side fetch helpers ───

/** A single API call is aborted after this long, so a page can never hang forever. */
const API_TIMEOUT_MS = 20_000;
/** How long a proxied route handler waits for the API before answering 504. */
const PROXY_TIMEOUT_MS = 25_000;
/** Pause before the one retry on transient failures (cold start, gateway blip). */
const API_RETRY_DELAY_MS = 500;

/**
 * A call to the API failed in a way the page should show instead of hide.
 * Thrown errors land in the route's error boundary (app/app/error.tsx,
 * app/admin/error.tsx) with a Try again action, so a broken API reads as a
 * visible failure rather than empty zeros that look like real data.
 */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly path: string;
  constructor(status: number, path: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.path = path;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One fetch to the API with a hard timeout, retried once for reads when the
 * API is unreachable or answers 502/503/504 (Railway cold start). Writes
 * are never retried: a POST that runs twice is worse than a visible failure.
 */
async function apiFetch(path: string, init: RequestInit, retry: boolean): Promise<Response> {
  const attempt = () =>
    fetch(`${API_URL}${path}`, { ...init, signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  let lastErr: unknown = null;
  const tries = retry ? 2 : 1;
  for (let n = 1; n <= tries; n++) {
    if (n > 1) await sleep(API_RETRY_DELAY_MS);
    let res: Response;
    try {
      res = await attempt();
    } catch (err) {
      lastErr = err; // timeout or network failure
      continue;
    }
    if (retry && (res.status === 502 || res.status === 503 || res.status === 504)) {
      lastErr = new Error(`API answered ${res.status}`);
      continue;
    }
    return res;
  }
  const timedOut =
    lastErr instanceof Error && (lastErr.name === "TimeoutError" || lastErr.name === "AbortError");
  throw new ApiRequestError(
    0,
    path,
    timedOut
      ? `The ORQ8 API did not respond within ${API_TIMEOUT_MS / 1000} seconds (${path}).`
      : `Could not reach the ORQ8 API (${path}). It may be restarting, try again in a moment.`,
  );
}

/**
 * Call the ORQ8 API with a bearer token from a server component.
 *
 * Behavior by outcome:
 *   no/invalid session (401)  -> redirect to /login (login re-validates the
 *                                session, so a stale cookie cannot loop)
 *   email not verified (403)  -> redirect to /check-email
 *   API unreachable / 5xx     -> throws ApiRequestError (error boundary)
 *   200 with a body           -> the envelope's data, or null if unparseable
 *
 * Server components only: redirect() throws, which route handlers must not.
 */
export async function fetchWithToken<T>(
  token: string,
  path: string,
  options?: { method?: string; body?: unknown; revalidate?: number | false },
): Promise<T | null> {
  const method = (options?.method ?? "GET").toUpperCase();
  const isWrite = method !== "GET";
  const init: RequestInit = {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options?.body ? { "content-type": "application/json" } : {}),
    },
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    // Cache GET requests for 30s by default (reduces Railway cold-start latency
    // on repeated navigations). Writes always bypass cache. Pass
    // revalidate: false to opt out entirely, or a custom seconds value.
    // NOTE: in Next 15 `next: { revalidate: false }` means INFINITE cache, not
    // "no cache", so the opt-out is expressed as cache: "no-store".
    ...(isWrite
      ? {}
      : options?.revalidate === false
        ? { cache: "no-store" as const }
        : { next: { revalidate: options?.revalidate ?? 30 } }),
  };
  const res = await apiFetch(path, init, !isWrite);
  if (res.status === 401) redirect("/login");
  const body = await res.json().catch(() => null);
  if (res.status === 403) {
    const code = (body as { error?: { code?: string } } | null)?.error?.code;
    if (code === "email_not_verified") redirect("/check-email?next=/app");
    throw new ApiRequestError(403, path, parseApiError(body, "You do not have access to this data."));
  }
  if (!res.ok) {
    throw new ApiRequestError(
      res.status,
      path,
      parseApiError(body, `The ORQ8 API could not complete ${path} (status ${res.status}).`),
    );
  }
  if (body === null) return null;
  return (body as { data?: T }).data ?? (body as T) ?? null;
}

/**
 * Fetch from the ORQ8 API with the session cookie (server components).
 * No session -> /login; failures throw ApiRequestError so the route's
 * error boundary shows them instead of rendering empty data.
 */
export async function fetchWithAuth<T>(
  path: string,
  options?: { method?: string; body?: unknown; revalidate?: number | false },
): Promise<T | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    // The app layout gate usually catches this first; this fallback keeps a
    // page from ever rendering empty data as if it were real.
    redirect("/login");
  }
  return fetchWithToken<T>(token, path, options);
}

// ─── Utility functions ───

/** Format cents as dollar amount */
export function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Format ISO date as human-readable time ago */
export function formatTimeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

/** Format ISO date as short date */
export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "Unknown";
  }
}
