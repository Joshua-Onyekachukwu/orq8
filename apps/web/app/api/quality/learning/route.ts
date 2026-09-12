import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../../lib/api";

function getSessionToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

// GET /api/quality/learning — organizational learning events (company memory).
// The Quality and Learning pages consume this; the proxy was missing, so the
// tab silently rendered empty on production despite the backend being fine.
export async function GET(request: NextRequest) {
  const token = getSessionToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = new URL(request.url).searchParams.get("limit") ?? "20";
  try {
    const res = await fetch(`${API_URL}/v1/quality/learning?limit=${encodeURIComponent(limit)}`, {
      headers: proxyAuthHeaders(token),
      next: { revalidate: 30 },
    });
    if (!res.ok) return NextResponse.json({ error: "Failed" }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
