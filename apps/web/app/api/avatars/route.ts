import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../lib/api";

/**
 * POST /api/avatars — proxy avatar upload to the backend. Forwards the JSON
 * body ({ mimeType, body: base64 }); the backend validates size, MIME and
 * magic bytes and attaches the result to the *session* user.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => null);
    const res = await fetch(`${API_URL}/v1/users/me/avatar`, {
      method: "POST",
      headers: { ...proxyAuthHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}

/**
 * DELETE /api/avatars — remove the session user's avatar.
 */
export async function DELETE(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    const res = await fetch(`${API_URL}/v1/users/me/avatar`, {
      method: "DELETE",
      headers: proxyAuthHeaders(token),
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
