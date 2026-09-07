import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../../lib/api";

// GET /api/integrations/[id]/health — real server-side provider health check.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyApiJson(request, `/v1/integrations/${id}/health`);
}