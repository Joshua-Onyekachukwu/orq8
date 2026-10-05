import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders, parseApiError } from "../../../../lib/api";

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
      // Never cached. This is one company's task and the page refetches it
      // immediately after an action; `revalidate: 30` put the API response in
      // Next's shared data cache, so that refetch handed back the state from
      // before the action ("now awaiting approval" in the toast, PENDING on the
      // badge, no link to the decision).
      cache: "no-store",
    });
    if (!res.ok) {
      const upstream = await res.json().catch(() => null);
      return NextResponse.json(
        { error: parseApiError(upstream, "Not found") },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json(), { headers: { "Cache-Control": "no-store" } });
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
    if (!res.ok) {
      const upstream = await res.json().catch(() => null);
      return NextResponse.json(
        { error: parseApiError(upstream, "Request failed") },
        { status: res.status },
      );
    }
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
    if (!res.ok) {
      const upstream = await res.json().catch(() => null);
      return NextResponse.json(
        { error: parseApiError(upstream, "Request failed") },
        { status: res.status },
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
