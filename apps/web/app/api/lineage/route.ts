import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../lib/api";

function getSessionToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

// GET /api/lineage — Full strategic tree
export async function GET(request: NextRequest) {
  const token = getSessionToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const res = await fetch(`${API_URL}/v1/lineage/tree`, {
      headers: proxyAuthHeaders(token),
      next: { revalidate: 60 },
    });
    if (!res.ok) return NextResponse.json({ error: "Failed" }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
