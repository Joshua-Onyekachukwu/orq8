import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../lib/api";

function getSessionToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

// GET /api/decisions — List decisions
export async function GET(request: NextRequest) {
  const token = getSessionToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const qs = request.nextUrl.search;
    const res = await fetch(`${API_URL}/v1/decisions${qs}`, {
      headers: proxyAuthHeaders(token),
      next: { revalidate: 30 },
    });
    if (!res.ok) return NextResponse.json({ error: "Failed" }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}

// POST /api/decisions — Create a decision
export async function POST(request: NextRequest) {
  const token = getSessionToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body?.title || !body?.whatWasDecided) {
    return NextResponse.json({ error: "title and whatWasDecided required" }, { status: 400 });
  }
  try {
    const res = await fetch(`${API_URL}/v1/decisions`, {
      method: "POST",
      headers: proxyAuthHeaders(token, "application/json"),
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
