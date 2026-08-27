import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "../../../../lib/api";

// POST /api/auth/reset-password — Proxy to the ORQ8 API
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.token || !body?.password) {
    return NextResponse.json(
      { error: { code: "validation", message: "Token and password are required" } },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${API_URL}/v1/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: body.token, password: body.password }),
    });

    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: { code: "upstream.unreachable", message: "Could not reach the ORQ8 API" } },
      { status: 502 }
    );
  }
}
