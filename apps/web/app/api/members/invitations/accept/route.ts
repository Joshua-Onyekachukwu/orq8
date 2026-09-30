import { proxyApiJson } from "../../../../../lib/api";
import type { NextRequest } from "next/server";

// POST /api/members/invitations/accept — accept an invitation with the account
// that is signed in. The API refuses an address that was not the invited one, so
// a forwarded link cannot seat somebody else.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, "/v1/members/invitations/accept", { method: "POST", body });
}
