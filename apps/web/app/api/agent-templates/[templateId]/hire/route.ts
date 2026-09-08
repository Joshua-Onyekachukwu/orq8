import { NextRequest } from "next/server";
import { API_URL, proxyApiJson } from "../../../../../lib/api";

/** POST /api/agent-templates/:templateId/hire — hire an agent from a template. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await params;
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, `${API_URL}/v1/agent-templates/${templateId}/hire`, {
    method: "POST",
    body,
  });
}
