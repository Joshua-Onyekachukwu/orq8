import { proxyApiJson } from "../../../../lib/api";
import type { NextRequest } from "next/server";

// POST /api/org/switch — move this session into another organization the user
// belongs to. Used right after accepting an invitation: the API binds a session
// to one organization, so an invited teammate needs this to act in the company
// that invited them.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, "/v1/org/switch", { method: "POST", body });
}
