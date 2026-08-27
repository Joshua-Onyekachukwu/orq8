import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "../../../../lib/api";

// POST /api/auth/forgot-password — Proxy to the ORQ8 API
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.email) {
    return NextResponse.json(
      { error: { code: "validation", message: "Email is required" } },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${API_URL}/v1/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: body.email }),
    });

    const data = await res.json().catch(() => null);
    // Always return success to the client to prevent email enumeration
    return NextResponse.json({ data: { ok: true } }, { status: 200 });
  } catch {
    // Even if the API is down, return success to prevent information leakage
    return NextResponse.json({ data: { ok: true } }, { status: 200 });
  }
}
