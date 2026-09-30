import { proxyApiJson } from "../../../../../../lib/api";
import type { NextRequest } from "next/server";

// POST /api/members/invitations/[id]/renew — mint a fresh accept link.
//
// Only a hash of each token is stored, so a link that was lost cannot be
// displayed again; the API issues a new one (and stops the old one working),
// which also re-sends the invitation email.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyApiJson(request, `/v1/members/invitations/${id}/renew`, { method: "POST", body: {} });
}
