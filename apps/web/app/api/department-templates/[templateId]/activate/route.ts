import { NextRequest } from "next/server";
import { API_URL, proxyApiJson } from "../../../../../lib/api";

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
  return proxyApiJson(request, `${API_URL}/v1/department-templates/${templateId}/activate`, {
    method: "POST",
    body: {},
  });
}
