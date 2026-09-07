import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../../../lib/api";

// GET /api/integrations/[id]/oauth/authorize?redirect_uri=... — starts the
// real OAuth flow; returns { url } pointing at the provider. The page
// redirects the browser there. The callback route (integrations/callback)
// exchanges the code server-side.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const redirectUri = request.nextUrl.searchParams.get("redirect_uri") ?? "";
  const qs = redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : "";
  return proxyApiJson(request, `/v1/integrations/${id}/oauth/authorize${qs}`);
}