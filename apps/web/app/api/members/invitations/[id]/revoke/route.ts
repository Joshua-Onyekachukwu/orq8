import { proxyApiJson } from "../../../../../../lib/api";
import type { NextRequest } from "next/server";

// POST /api/members/invitations/[id]/revoke — withdraw a pending invitation.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyApiJson(request, `/v1/members/invitations/${id}/revoke`, { method: "POST", body: {} });
}
