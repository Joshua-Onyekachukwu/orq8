import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "../../../../lib/api";

/**
 * POST /api/auth/verify-email — consume a one-time verification token.
 * Public: the token is the credential, no session required.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const res = await fetch(`${API_URL}/v1/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
