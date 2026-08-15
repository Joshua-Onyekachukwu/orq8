import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE } from "../../../../lib/api";

// docs/35.3 — POST /v1/auth/logout proxied with the session cookie, then the
// local cookie is cleared and the browser is redirected to /login (303).
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await fetch(`${API_URL}/v1/auth/logout`, {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      });
    } catch {
      // best-effort: still clear the local cookie so the user can sign back in
    }
  }

  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
