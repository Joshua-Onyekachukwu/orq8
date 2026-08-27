import { NextRequest, NextResponse } from "next/server";
import { proxyApiJson } from "../../../../lib/api";

// GET /api/agents/:id — get single agent
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyApiJson(request, `/v1/agents/${id}`);
}

// PATCH /api/agents/:id — update agent status (pause/resume)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, `/v1/agents/${id}`, {
    method: "PATCH",
    body,
  });
}
