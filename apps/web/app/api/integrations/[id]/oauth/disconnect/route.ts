import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../../../lib/api";

// POST /api/integrations/[id]/oauth/disconnect — removes stored credentials
// (encrypted at rest) and marks the provider disconnected.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyApiJson(request, `/v1/integrations/${id}/oauth/disconnect`, { method: "POST" });
}