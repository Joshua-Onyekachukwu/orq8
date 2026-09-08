import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../../lib/api";

function getSessionToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

// GET /api/decisions/:id
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = getSessionToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const res = await fetch(`${API_URL}/v1/decisions/${id}`, {
      headers: proxyAuthHeaders(token),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}

// PATCH /api/decisions/:id
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = getSessionToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  try {
    const res = await fetch(`${API_URL}/v1/decisions/${id}`, {
      method: "PATCH",
      headers: proxyAuthHeaders(token, "application/json"),
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
