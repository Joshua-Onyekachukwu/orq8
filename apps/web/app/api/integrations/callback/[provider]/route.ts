import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../../../lib/api";

// GET /api/integrations/callback/:provider?code=...&state=... — the browser is
// redirected here by the OAuth provider after the founder approves. The
// providerId is read from the (HMAC-signed) state; the backend re-verifies the
// signature and org/provider binding before exchanging the code server-side.
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.redirect(new URL("/login", request.nextUrl.origin));

  const code = request.nextUrl.searchParams.get("code") ?? "";
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const redirectUri = `${request.nextUrl.origin}/api/integrations/callback/${provider}`;

  // Decode the providerId from the state body (base64url JSON). The backend
  // re-verifies the HMAC signature and org/provider binding, so deriving the
  // providerId client-side is safe — a forged state fails verification.
  let providerId = "";
  try {
    const body = state.split(".")[0] ?? "";
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { providerId?: string };
    providerId = decoded.providerId ?? "";
  } catch {
    // Fall through — backend will reject the state anyway.
  }

  const target = `${API_URL}/v1/integrations/${providerId}/oauth/callback`;
  try {
    const res = await fetch(target, {
      method: "POST",
      headers: proxyAuthHeaders(token, "application/json"),
      body: JSON.stringify({ code, state, redirectUri }),
    });
    const data = (await res.json().catch(() => null)) as { data?: { connected?: boolean; login?: string; health?: string } } | null;
    const connected = data?.data?.connected;
    const login = data?.data?.login;
    const status = res.ok && connected ? "connected" : "failed";
    const qs = new URLSearchParams({ status, ...(login ? { login } : {}) });
    return NextResponse.redirect(new URL(`/app/integrations?oauth=${qs.toString()}`, request.nextUrl.origin));
  } catch {
    return NextResponse.redirect(new URL("/app/integrations?oauth=status=failed", request.nextUrl.origin));
  }
}