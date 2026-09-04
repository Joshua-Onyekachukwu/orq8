import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../../lib/api";

function getSessionToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

// GET /api/tasks/[id] — Get a single task
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = getSessionToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const res = await fetch(`${API_URL}/v1/tasks/${id}`, {
      headers: proxyAuthHeaders(token),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: "Not found" }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}

// PATCH /api/tasks/[id] — Update a task
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = getSessionToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null);

  try {
    const res = await fetch(`${API_URL}/v1/tasks/${id}`, {
      method: "PATCH",
      headers: proxyAuthHeaders(token, "application/json"),
      body: JSON.stringify(body),
    });
    if (!res.ok) return NextResponse.json({ error: "Failed" }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}

// DELETE /api/tasks/[id] — Delete a task
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = getSessionToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const res = await fetch(`${API_URL}/v1/tasks/${id}`, {
      method: "DELETE",
      headers: proxyAuthHeaders(token),
    });
    if (!res.ok) return NextResponse.json({ error: "Failed" }, { status: res.status });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
