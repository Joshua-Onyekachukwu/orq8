import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../lib/api";

function getToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

// GET /api/capabilities — list the org's reusable capability registry
export async function GET(request: NextRequest) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const search = request.nextUrl.searchParams.get("query");
  const url = search
    ? `${API_URL}/v1/capabilities/search?query=${encodeURIComponent(search)}`
    : `${API_URL}/v1/capabilities`;
  try {
    const res = await fetch(url, {
      headers: proxyAuthHeaders(token),
      next: { revalidate: 15 },
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}