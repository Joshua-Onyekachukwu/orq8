import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../../lib/api";

function getToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

// POST /api/engineering-manager/plan
export async function POST(request: NextRequest) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body?.objective) return NextResponse.json({ error: "objective is required" }, { status: 400 });

  try {
    const res = await fetch(`${API_URL}/v1/engineering-manager/plan`, {
      method: "POST",
      headers: proxyAuthHeaders(token, "application/json"),
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}