import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../../../lib/api";

function getToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

// POST /api/business-imports/:id/reject — founder declines the proposal
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const res = await fetch(`${API_URL}/v1/business-imports/${id}/reject`, {
      method: "POST",
      headers: proxyAuthHeaders(token),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
