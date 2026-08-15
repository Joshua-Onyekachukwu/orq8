import { NextRequest, NextResponse } from "next/server";
import { API_URL, attachSessionCookie, parseApiError } from "../../../../lib/api";

// docs/35.3 — POST /v1/auth/register proxied (creates user + org + membership +
// session atomically server-side); the token becomes the httpOnly orq8_session cookie.
export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown; name?: unknown; org_name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : undefined;
  const org_name = typeof body.org_name === "string" ? body.org_name.trim() : "";
  if (!email || !password || !org_name) {
    return NextResponse.json(
      { ok: false, error: "Email, password, and organization name are required" },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: "Password must be at least 8 characters" }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_URL}/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, org_name }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: parseApiError(data, "Registration failed") },
        { status: res.status === 409 ? 409 : 400 },
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
