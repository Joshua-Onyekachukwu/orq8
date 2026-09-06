import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../../../lib/api";

function getSessionToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

// GET /api/goals/[id]/intelligence — goal drill-down (tasks, blockers, anomalies, recovery proposal)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = getSessionToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const res = await fetch(`${API_URL}/v1/goals/${id}/intelligence`, {
      headers: proxyAuthHeaders(token),
      next: { revalidate: 30 },
    });
    if (!res.ok) return NextResponse.json({ error: "Not found" }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}