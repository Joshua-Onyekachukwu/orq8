// GET /api/deliberations/progress?ids=a,b — completion probe for pending
// council sessions (proxied; org-scoped server-side).
import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../../lib/api";

function getSessionToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

export async function GET(request: NextRequest) {
  const token = getSessionToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ids = request.nextUrl.searchParams.get("ids") ?? "";
  try {
    const res = await fetch(`${API_URL}/v1/deliberations/progress?ids=${encodeURIComponent(ids)}`, {
      headers: proxyAuthHeaders(token),
      cache: "no-store",
    });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Upstream unavailable" }, { status: 502 });
  }
}
