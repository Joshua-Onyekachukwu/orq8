import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../../lib/api";

/**
 * POST /api/department-templates/:templateId/activate — one-click activation:
 * creates the department from the template plus its template-defined teams
 * (idempotent per org; entitlement caps enforced server-side).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await params;
  // proxyApiJson prefixes API_URL itself — pass the bare v1 path (the
  // double-prefixed form produced an unresolvable URL and a 502 for the
  // founder's one-click department activation; docs/83 §route-proxy).
  return proxyApiJson(request, `/v1/department-templates/${templateId}/activate`, {
    method: "POST",
    body: {},
  });
}
