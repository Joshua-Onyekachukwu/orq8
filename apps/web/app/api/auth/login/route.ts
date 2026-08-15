import { NextRequest, NextResponse } from "next/server";
import { API_URL, attachSessionCookie, parseApiError } from "../../../../lib/api";

// docs/35.3 — POST /v1/auth/login proxied; on success the session token becomes
// the httpOnly orq8_session cookie so the browser never handles tokens (ADR-007).
export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "Email and password are required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_URL}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: parseApiError(data, "Invalid email or password") },
        { status: 401 },
      );
    }

    const token = (data as { data?: { token?: unknown } } | null)?.data?.token;
    if (typeof token !== "string" || token.length === 0) {
      return NextResponse.json({ ok: false, error: "Unexpected API response" }, { status: 502 });
    }

    return attachSessionCookie(NextResponse.json({ ok: true }), token);
  } catch {
    return NextResponse.json({ ok: false, error: "Could not reach the ORQ8 API" }, { status: 502 });
  }
}
