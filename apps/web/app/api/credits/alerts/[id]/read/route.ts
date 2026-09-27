import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../../../lib/api";

// PATCH /api/credits/alerts/[id]/read: acknowledge a Work Credits alert.
//
// Used by the attention queue: acknowledging clears the item from the queue
// without pretending the underlying balance problem is solved.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyApiJson(request, `/v1/credits/alerts/${id}/read`, { method: "PATCH", body: {} });
}
