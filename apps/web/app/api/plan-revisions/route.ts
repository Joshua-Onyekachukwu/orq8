import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

// GET  /api/plan-revisions — the Plan page's revision rail + current/pending
// POST /api/plan-revisions — draft a new revision (auto rev = max+1, audited)
export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/plan-revisions");
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, "/v1/plan-revisions", { method: "POST", body });
}
