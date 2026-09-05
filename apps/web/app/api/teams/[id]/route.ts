import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../lib/api";

// PATCH /api/teams/:id — update/archive a team
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, `/v1/teams/${id}`, { method: "PATCH", body });
}

// DELETE /api/teams/:id — delete a team (guarded server-side)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyApiJson(request, `/v1/teams/${id}`, { method: "DELETE" });
}