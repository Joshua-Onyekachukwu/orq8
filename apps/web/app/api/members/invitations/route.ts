import { proxyApiJson } from "../../../../lib/api";
import type { NextRequest } from "next/server";

// GET /api/members/invitations — pending and past invitations for this company.
// Session-scoped, so it is never publicly cached.
export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/members/invitations", { cache: "private" });
}

// POST /api/members/invitations — invite a teammate.
// The API decides who may invite and which roles may be granted; the response
// carries the accept link and a `delivery` verdict ('sent' | 'unconfigured' |
// 'failed') so the founder knows whether an email went out.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, "/v1/members/invitations", { method: "POST", body });
}
