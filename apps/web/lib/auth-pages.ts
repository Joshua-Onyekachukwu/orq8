import { cookies } from "next/headers";
import { API_URL, SESSION_COOKIE } from "./api";

// Shared helpers for the auth pages (login, register, forgot/reset password).

/**
 * Validates a ?next= redirect target: internal absolute paths only, so the
 * value can never smuggle an open redirect (no //host, no backslash tricks).
 */
export function safeNext(value: string | string[] | null | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.includes("\\")) return null;
  return raw;
}

/**
 * Post-sign-in destination guard: safeNext plus a rejection of the auth pages
 * themselves. A crafted ?next=/login would otherwise send an authenticated
 * user into a redirect loop between the form and the page that guards it.
 */
export function postAuthTarget(value: string | string[] | null | undefined): string | null {
  const target = safeNext(value);
  if (!target) return null;
  const authPages = [
    "/login",
    "/register",
    "/check-email",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
  ];
  if (authPages.some((p) => target === p || target.startsWith(`${p}/`) || target.startsWith(`${p}?`))) {
    return null;
  }
  return target;
}

/**
 * Server-side session probe for the auth pages. A valid session (proven
 * against the API, no-store) means an authed user landed on a sign-in page,
 * so the page redirects into the app. Cookie presence alone proves nothing:
 * an expired cookie must render the form again, never redirect, or the two
 * sides ping-pong (the old /login to /app loop).
 *
 * Also returns the verified flag so the login page can route unconfirmed
 * accounts straight to the confirm-email page.
 */
export async function probeSession(): Promise<{
  authenticated: boolean;
  emailVerified: boolean;
  email: string | null;
}> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { authenticated: false, emailVerified: false, email: null };
  try {
    const res = await fetch(`${API_URL}/v1/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return { authenticated: false, emailVerified: false, email: null };
    const json = (await res.json()) as {
      data?: { user?: { emailVerified?: boolean; email?: string } };
    };
    const user = json?.data?.user;
    return {
      authenticated: true,
      emailVerified: user?.emailVerified === true,
      email: typeof user?.email === "string" ? user.email : null,
    };
  } catch {
    // API unreachable: treat as unauthenticated so the sign-in form renders
    // (submission surfaces the upstream error honestly).
    return { authenticated: false, emailVerified: false, email: null };
  }
}

/**
 * Which OAuth providers this deployment has configured. The API is the single
 * source of truth: buttons only render for providers with real credentials,
 * so the UI never advertises a flow that cannot work.
 */
export async function oauthProviders(): Promise<{ github: boolean; google: boolean }> {
  try {
    const res = await fetch(`${API_URL}/v1/auth/oauth/providers`, {
      cache: "no-store",
    });
    if (!res.ok) return { github: false, google: false };
    const json = (await res.json()) as {
      data?: { github?: boolean; google?: boolean };
    };
    return { github: json?.data?.github === true, google: json?.data?.google === true };
  } catch {
    return { github: false, google: false };
  }
}
