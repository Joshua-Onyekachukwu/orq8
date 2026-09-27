import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../../lib/api";

/**
 * Logout: POST /v1/auth/logout revokes the session server-side (the API also
 * evicts its Redis cache entry, so the token is dead immediately), then the
 * local httpOnly cookie is cleared and the browser returns to the landing
 * page. GET is handled identically for direct browser navigation, so no
 * form-vs-link mismatch exists and nothing can 405.
 */
async function performLogout(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await fetch(`${API_URL}/v1/auth/logout`, {
        method: "POST",
        headers: proxyAuthHeaders(token),
      });
    } catch {
      // best-effort: still clear the local cookie so the user can sign back in
    }
  }

  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}

export async function POST(request: NextRequest) {
  return performLogout(request);
}

export async function GET(request: NextRequest) {
  return performLogout(request);
}
