import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../../lib/api";

// docs/80 Phase 4 — PATCH /api/providers/keys/:id updates a key's spending
// controls (monthly ceiling, enabled, model allow-list). Secrets are never sent
// here; rotation has its own endpoint.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, `/v1/providers/keys/${id}`, { method: "PATCH", body });
}
