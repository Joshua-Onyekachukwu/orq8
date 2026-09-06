import { NextRequest } from "next/server";
import { API_URL, SESSION_COOKIE } from "../../../../lib/api";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return Response.json({ error: { code: "unauthorized", message: "Sign in required" } }, { status: 401 });
  }
  const { id } = await params;
  try {
    const res = await fetch(`${API_URL}/v1/event-rules/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return new Response(null, { status: res.status });
  } catch {
    return Response.json({ error: { code: "upstream.unreachable", message: "Could not reach the ORQ8 API" } }, { status: 502 });
  }
}
