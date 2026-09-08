import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../../../lib/api";

/**
 * POST /api/auth/verify-email/resend — proxy to the backend resend endpoint.
 * Auth-gated by the session cookie; the backend enforces the real rate limit
 * (3 per user per hour) and returns 429 with a retry hint when exceeded.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    const res = await fetch(`${API_URL}/v1/auth/verify-email/resend`, {
      method: "POST",
      headers: proxyAuthHeaders(token),
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
