import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../../lib/api";

/** POST /api/agent-templates/:templateId/hire — hire an agent from a template. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await params;
  const body = await request.json().catch(() => null);
  // proxyApiJson prefixes API_URL itself — pass the bare v1 path (the
  // double-prefixed form produced an unresolvable URL and a 502 for the
  // founder's hire action; docs/83 §route-proxy).
  return proxyApiJson(request, `/v1/agent-templates/${templateId}/hire`, {
    method: "POST",
    body,
  });
}
