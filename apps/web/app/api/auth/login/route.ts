import { NextRequest, NextResponse } from "next/server";
import { API_URL, attachSessionCookie, parseApiError } from "../../../../lib/api";

// docs/35.3 — POST /v1/auth/login proxied; on success the session token becomes
// the httpOnly orq8_session cookie so the browser never handles tokens (ADR-007).
//
// Failures keep the API's status code, error code, and Retry-After header.
// Collapsing everything to 401 (the old behavior) made the lockout countdown
// and the unconfirmed-email flow unreachable from the client.
export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Enter your email and password." },
      { status: 400 },
    );
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "Enter your email and password." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${API_URL}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = (await res.json().catch(() => null)) as {
      data?: { token?: unknown };
      error?: { code?: unknown; message?: unknown };
    } | null;

    if (!res.ok) {
      const code = typeof data?.error?.code === "string" ? data.error.code : undefined;
      const payload: Record<string, unknown> = {
        ok: false,
        error: parseApiError(data, "Sign in failed. Check your email and password, then try again."),
      };
      if (code) payload.code = code;
      const headers: Record<string, string> = {};
      const retryAfter = res.headers.get("Retry-After");
      if (retryAfter) headers["Retry-After"] = retryAfter;
      return NextResponse.json(payload, { status: res.status, headers });
    }

    const token = data?.data?.token;
    if (typeof token !== "string" || token.length === 0) {
      return NextResponse.json(
        { ok: false, error: "The sign-in service returned an unexpected response. Try again." },
        { status: 502 },
      );
    }

    return attachSessionCookie(NextResponse.json({ ok: true }), token);
  } catch (err) {
    console.error("[auth/login] API unreachable:", err);
    return NextResponse.json(
      { ok: false, error: "Could not reach the ORQ8 API. Try again in a moment." },
      { status: 502 },
    );
  }
}
