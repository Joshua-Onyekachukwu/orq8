import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "../../../../../lib/api";

/**
 * POST /api/auth/verify-email/request — request a new confirmation email for
 * an account that cannot sign in yet. Public (the email address is the input,
 * no session exists by definition). The API answers identically whether or
 * not the account exists, so this route passes that response through
 * unchanged: it must never become an account-existence oracle.
 */
export async function POST(request: NextRequest) {
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Enter the email address you registered with." },
      { status: 400 },
    );
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Enter the email address you registered with." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${API_URL}/v1/auth/verify-email/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok && res.status !== 400) {
      return NextResponse.json(
        { ok: false, error: "Could not send the email right now. Try again in a moment." },
        { status: 502 },
      );
    }
    return NextResponse.json(data ?? { data: { ok: true } }, { status: res.status });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not reach the ORQ8 API. Try again in a moment." },
      { status: 502 },
    );
  }
}
