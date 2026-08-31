import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../lib/api";

// SECURITY: userId is derived from the authenticated session, never from the client body.
// Onboarding state is persisted to the database via the backend API.

function getSessionCookie(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

// GET /api/onboarding — Get current onboarding state (proxied to backend)
export async function GET(request: NextRequest) {
  const token = getSessionCookie(request);
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const res = await fetch(`${API_URL}/v1/onboarding`, {
      headers: proxyAuthHeaders(token),
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to load onboarding" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}

// POST /api/onboarding — Update onboarding state (proxied to backend)
export async function POST(request: NextRequest) {
  const token = getSessionCookie(request);
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.step) {
    return NextResponse.json({ error: "step is required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_URL}/v1/onboarding`, {
      method: "POST",
      headers: proxyAuthHeaders(token, "application/json"),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to save onboarding" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
