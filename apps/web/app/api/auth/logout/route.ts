import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../../lib/api";

/**
 * POST /v1/auth/logout — proxied with the session cookie, then the
 * local cookie is cleared and the browser is redirected to /login (303).
 *
 * GET — also handles logout via GET for direct browser navigation.
 * Clears the local session cookie and redirects to /login.
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

  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}

export async function POST(request: NextRequest) {
  return performLogout(request);
}

export async function GET(request: NextRequest) {
  return performLogout(request);
}
