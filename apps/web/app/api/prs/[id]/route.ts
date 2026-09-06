import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../../lib/api";

function getToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

// PATCH /api/prs/:id — approve | reject | request changes | merge
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body?.status) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  try {
    const res = await fetch(`${API_URL}/v1/prs/${id}`, {
      method: "PATCH",
      headers: proxyAuthHeaders(token, "application/json"),
      body: JSON.stringify({ status: body.status, note: body.note }),
      cache: "no-store",
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}