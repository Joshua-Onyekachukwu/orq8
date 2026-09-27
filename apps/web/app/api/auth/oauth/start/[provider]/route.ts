import { NextResponse, type NextRequest } from "next/server";
import { API_URL } from "../../../../../../lib/api";
import { safeNext } from "../../../../../../lib/auth-pages";

// GET /api/auth/oauth/start/:provider?next=...
//
// Asks the API to build the provider consent URL (the API signs the state and
// keeps every client secret). The callback URL we hand over is this web app's
// own /api/auth/oauth/callback/:provider, which is the only redirect URI the
// API will accept for sign-in. The browser then goes straight to the provider.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const origin = request.nextUrl.origin;
  if (provider !== "github" && provider !== "google") {
    return NextResponse.redirect(new URL("/login?oauth_error=provider_unknown", origin), 303);
  }

  const redirectUri = `${origin}/api/auth/oauth/callback/${provider}`;
  const next = safeNext(request.nextUrl.searchParams.get("next"));

  const qs = new URLSearchParams({ redirect_uri: redirectUri });
  if (next) qs.set("next", next);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/auth/oauth/${provider}/start?${qs.toString()}`, {
      cache: "no-store",
    });
  } catch {
    return NextResponse.redirect(new URL("/login?oauth_error=start_failed", origin), 303);
  }

  const data = (await res.json().catch(() => null)) as { data?: { url?: unknown } } | null;
  const url = data?.data?.url;
  if (!res.ok || typeof url !== "string" || url.length === 0) {
    const code = res.status === 503 ? "not_configured" : "start_failed";
    return NextResponse.redirect(new URL(`/login?oauth_error=${code}`, origin), 303);
  }

  const response = NextResponse.redirect(url, 302);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
