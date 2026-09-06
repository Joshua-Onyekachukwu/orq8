import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../../lib/api";

function getToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

// POST /api/capabilities/resolve — reuse-vs-build decision for a request
export async function POST(request: NextRequest) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => null);
    const res = await fetch(`${API_URL}/v1/capabilities/resolve`, {
      method: "POST",
      headers: { ...proxyAuthHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
