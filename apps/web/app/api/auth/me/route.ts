import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE } from "../../../../lib/api";

function getSessionCookie(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

// GET /api/auth/me — Get current user info
export async function GET(request: NextRequest) {
  const token = getSessionCookie(request);
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const res = await fetch(`${API_URL}/v1/auth/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to load user" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}

// PATCH /api/auth/me — Update user profile
export async function PATCH(request: NextRequest) {
  const token = getSessionCookie(request);
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_URL}/v1/auth/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE}=${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => null);
      return NextResponse.json(error ?? { error: "Failed to update profile" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
