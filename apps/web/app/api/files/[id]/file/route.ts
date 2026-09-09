import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../../../lib/api";

/**
 * GET /api/files/:id/file — stable avatar/file URL used in users.avatar_url.
 * Proxies to the backend's org-scoped signed-URL endpoint and 302-redirects
 * to it. Auth is enforced by the session cookie on every request; the signed
 * URL itself is short-lived so nothing long-lived is exposed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
  }
  try {
    const res = await fetch(`${API_URL}/v1/files/${id}/file`, {
      headers: proxyAuthHeaders(token),
      redirect: "manual",
    });
    if (res.status === 302 || res.status === 301 || res.status === 307) {
      const location = res.headers.get("location");
      if (location) {
        return NextResponse.redirect(location, { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
      }
    }
    // The API either streams bytes (local storage backend) or returns a
    // JSON error. Pass bytes through untouched; forward JSON errors with
    // their real status codes.
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return new NextResponse(res.body, {
        status: res.status,
        headers: {
          "Content-Type": contentType || "application/octet-stream",
          "Cache-Control": res.headers.get("cache-control") ?? "private, max-age=300",
        },
      });
    }
    const data = await res.json().catch(() => null);
    return NextResponse.json(data ?? { error: "File not found" }, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
