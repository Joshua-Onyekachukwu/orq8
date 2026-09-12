import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../lib/api";

function getSessionToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

// GET /api/deliberations — list council decisions (Decision Council, §47).
export async function GET(request: NextRequest) {
  const token = getSessionToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const res = await fetch(`${API_URL}/v1/deliberations`, {
      headers: proxyAuthHeaders(token),
      next: { revalidate: 15 },
    });
    if (!res.ok) return NextResponse.json({ error: "Failed" }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}

// POST /api/deliberations — start a council deliberation (async: returns 202
// + sessionId; the UI polls /api/deliberations/progress for completion).
export async function POST(request: NextRequest) {
  const token = getSessionToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const res = await fetch(`${API_URL}/v1/deliberations`, {
      method: "POST",
      headers: { ...proxyAuthHeaders(token), "content-type": "application/json" },
      body: JSON.stringify(body),
      // The start handshake is fast now; do not let the proxy hang either.
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
