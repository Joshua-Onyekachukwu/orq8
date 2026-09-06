import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../../lib/api";

function getSessionToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

// GET /api/quality/reliability — org-wide AI employee reliability profiles
export async function GET(request: NextRequest) {
  const token = getSessionToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const agentId = url.searchParams.get("agent_id");

  try {
    const path = agentId
      ? `${API_URL}/v1/quality/reliability/${encodeURIComponent(agentId)}`
      : `${API_URL}/v1/quality/reliability`;
    const res = await fetch(path, {
      headers: proxyAuthHeaders(token),
      next: { revalidate: 30 },
    });
    if (!res.ok) return NextResponse.json({ error: "Failed" }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}