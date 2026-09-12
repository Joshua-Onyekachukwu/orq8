import { NextRequest } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../lib/api";

function getSessionToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

// GET /api/briefings — generated executive briefings (supports kind, limit, offset)
export async function GET(request: NextRequest) {
  const token = getSessionToken(request);
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const qs = new URL(request.url).searchParams.toString();
  try {
    const res = await fetch(`${API_URL}/v1/briefings${qs ? `?${qs}` : ""}`, {
      headers: proxyAuthHeaders(token),
      next: { revalidate: 60 },
    });
    if (!res.ok) return Response.json({ error: "Failed" }, { status: res.status });
    return Response.json(await res.json());
  } catch {
    return Response.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
