import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../lib/api";

function getToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

// GET /api/knowledge/entities?type=&limit= — knowledge graph entities
// GET /api/knowledge/relations?limit= — graph edges with entity names
// GET /api/knowledge/decisions?limit= — decision memory
// GET /api/knowledge/search?query=&limit= — unified knowledge search
export async function GET(request: NextRequest) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") ?? "entities";
  const query = searchParams.get("query") ?? "";
  const limit = searchParams.get("limit") ?? "";
  const type = searchParams.get("type") ?? "";

  let path = "/v1/knowledge/entities";
  if (kind === "relations") path = "/v1/knowledge/relations";
  else if (kind === "decisions") path = "/v1/knowledge/decisions";
  else if (kind === "search") path = "/v1/knowledge/search";

  const params = new URLSearchParams();
  if (type && kind === "entities") params.set("type", type);
  if (query && kind === "search") params.set("query", query);
  if (limit) params.set("limit", limit);
  const qs = params.toString();

  try {
    const res = await fetch(`${API_URL}${path}${qs ? `?${qs}` : ""}`, {
      headers: proxyAuthHeaders(token),
      next: { revalidate: 30 },
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}

// POST /api/knowledge?kind=entity — create an entity
// POST /api/knowledge?kind=decision — record a decision (decision memory)
// POST /api/knowledge?kind=link — ensure two entities exist and link them
export async function POST(request: NextRequest) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") ?? "entity";
  let path = "/v1/knowledge/entities";
  if (kind === "decision") path = "/v1/knowledge/decisions";
  else if (kind === "link") path = "/v1/knowledge/link";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { ...proxyAuthHeaders(token), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}