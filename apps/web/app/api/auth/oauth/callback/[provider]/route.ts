import { NextResponse, type NextRequest } from "next/server";
import { API_URL, attachSessionCookie, safeOauthToken } from "../../../../../../lib/api";
import { safeNext } from "../../../../../../lib/auth-pages";

// GET /api/auth/oauth/callback/:provider?code=...&state=...
//
// The provider redirects the browser here (this exact URL is the redirect URI
// signed into the state and registered with the provider). We hand code +
// state + redirectUri to the API, which verifies the HMAC state and exchanges
// the code server-side; on success we swap the returned session token for the
// httpOnly orq8_session cookie and send the browser into the app. Failures
// land back on the sign-in page with a plain-language reason.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const origin = request.nextUrl.origin;
  const sp = request.nextUrl.searchParams;

  if (provider !== "github" && provider !== "google") {
    return NextResponse.redirect(new URL("/login?oauth_error=provider_unknown", origin), 303);
  }

  // The provider sends `error` when the user cancels consent or refuses.
  if (sp.get("error")) {
    return NextResponse.redirect(new URL("/login?oauth_error=cancelled", origin), 303);
  }

  const code = sp.get("code") ?? "";
  const state = sp.get("state") ?? "";
  if (!code || !state) {
    return NextResponse.redirect(new URL("/login?oauth_error=state_mismatch", origin), 303);
  }

  const redirectUri = `${origin}/api/auth/oauth/callback/${provider}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/auth/oauth/${provider}/callback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, state, redirectUri }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.redirect(new URL("/login?oauth_error=provider_error", origin), 303);
  }

  const data = (await res.json().catch(() => null)) as {
    data?: { token?: unknown; isNew?: unknown; next?: unknown };
    error?: { code?: unknown };
  } | null;

  if (!res.ok) {
    const apiCode = typeof data?.error?.code === "string" ? data.error.code : "";
    // Map API error codes to the short reasons the sign-in page explains.
    const reason =
      {
        oauth_state_invalid: "state_mismatch",
        oauth_not_configured: "not_configured",
        oauth_exchange_failed: "exchange_failed",
        oauth_password_conflict: "password_conflict",
        oauth_email_unverified: "email_unverified",
        oauth_email_missing: "email_missing",
        oauth_provider_error: "provider_error",
      }[apiCode] ?? "provider_error";
    return NextResponse.redirect(new URL(`/login?oauth_error=${reason}`, origin), 303);
  }

  const token = data?.data?.token;
  if (typeof token !== "string" || !safeOauthToken(token)) {
    return NextResponse.redirect(new URL("/login?oauth_error=provider_error", origin), 303);
  }

  const isNew = data?.data?.isNew === true;
  const next = safeNext(typeof data?.data?.next === "string" ? (data.data.next as string) : null);
  const target = next ?? (isNew ? "/onboarding" : "/app");

  const response = NextResponse.redirect(new URL(target, origin), 303);
  response.headers.set("Cache-Control", "no-store");
  return attachSessionCookie(response, token);
}
