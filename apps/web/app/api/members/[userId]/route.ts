import { proxyApiJson } from "../../../../lib/api";
import type { NextRequest } from "next/server";

// PATCH /api/members/[userId] — change a member's role.
// DELETE /api/members/[userId] — remove a member (the membership is deactivated,
// not deleted, so the audit trail keeps its referent).
//
// Both are owner/admin operations and both rules live in the API: only an owner
// may grant or revoke owner, nobody may change their own membership, and the last
// owner cannot be removed. This proxy only forwards, and passes the API's
// refusal through with its status so the UI can say what happened.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, `/v1/members/${userId}`, { method: "PATCH", body });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  return proxyApiJson(request, `/v1/members/${userId}`, { method: "DELETE" });
}
