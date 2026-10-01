import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../lib/api";

// GET /api/departments/:id — one department with everything its workspace reads
// (docs/71 §G): members, teams, live work, pending decisions, activity,
// decisions, memory, resources and the tools its roles may call.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyApiJson(request, `/v1/departments/${id}`);
}

// PATCH /api/departments/:id — update a department
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, `/v1/departments/${id}`, { method: "PATCH", body });
}

// DELETE /api/departments/:id — delete a department (guarded server-side)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyApiJson(request, `/v1/departments/${id}`, { method: "DELETE" });
}