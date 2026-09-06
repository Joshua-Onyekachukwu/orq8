import { NextRequest } from "next/server";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";

const SESSION = SESSION_COOKIE;

async function authHeaders(request: NextRequest): Promise<Record<string, string> | null> {
  const token = request.cookies.get(SESSION)?.value;
  if (!token) return null;
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

// GET /api/event-rules — list this org's event rules.
export async function GET(request: NextRequest) {
  const headers = await authHeaders(request);
  if (!headers) {
    return Response.json({ error: { code: "unauthorized", message: "Sign in required" } }, { status: 401 });
  }
  try {
    const res = await fetch(`${API_URL}/v1/event-rules`, { headers, cache: "no-store" });
    const body = await res.json().catch(() => null);
    return Response.json(body ?? { data: [] }, { status: res.status });
  } catch {
    return Response.json({ error: { code: "upstream.unreachable", message: "Could not reach the ORQ8 API" } }, { status: 502 });
  }
}

// PUT /api/event-rules — create or update (upsert per provider+eventType).
export async function PUT(request: NextRequest) {
  const headers = await authHeaders(request);
  if (!headers) {
    return Response.json({ error: { code: "unauthorized", message: "Sign in required" } }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: { code: "bad_request", message: "Invalid JSON body" } }, { status: 400 });
  try {
    const res = await fetch(`${API_URL}/v1/event-rules`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    return Response.json(json ?? {}, { status: res.status });
  } catch {
    return Response.json({ error: { code: "upstream.unreachable", message: "Could not reach the ORQ8 API" } }, { status: 502 });
  }
}
