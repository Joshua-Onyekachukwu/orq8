import { NextRequest, NextResponse } from "next/server";
import { API_URL, attachSessionCookie, parseApiError } from "../../../../lib/api";

// docs/35.3 — POST /v1/auth/register proxied (creates user + company +
// membership + session atomically server-side); the token becomes the
// httpOnly orq8_session cookie. Failures keep the API's status and error
// code so the form can respond precisely (duplicate email, rate limit, …).
export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown; name?: unknown; org_name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Enter your details and try again." },
      { status: 400 },
    );
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : undefined;
  const org_name = typeof body.org_name === "string" ? body.org_name.trim() : "";
  if (!email || !password || !org_name) {
    return NextResponse.json(
      { ok: false, error: "Enter your email, password, and company name." },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { ok: false, error: "Choose a password with at least 8 characters." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${API_URL}/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, org_name }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const code =
        typeof (data as { error?: { code?: unknown } } | null)?.error?.code === "string"
          ? ((data as { error: { code: string } }).error.code)
          : undefined;
      const payload: Record<string, unknown> = {
        ok: false,
        error: parseApiError(
          data,
          "Your company could not be created. Check your details and try again.",
        ),
      };
      if (code) payload.code = code;
      return NextResponse.json(payload, { status: res.status });
    }

    const token = (data as { data?: { token?: unknown } } | null)?.data?.token;
    if (typeof token !== "string" || token.length === 0) {
      return NextResponse.json(
        { ok: false, error: "The sign-up service returned an unexpected response. Try again." },
        { status: 502 },
      );
    }

    return attachSessionCookie(NextResponse.json({ ok: true }), token);
  } catch (err) {
    // Server-side only: the founder gets a plain message, the operator gets
    // the real reason (host refused, TLS, timeout) in the server logs.
    console.error("[auth/register] API unreachable:", err);
    return NextResponse.json(
      { ok: false, error: "Could not reach the ORQ8 API. Try again in a moment." },
      { status: 502 },
    );
  }
}
