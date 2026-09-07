import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../lib/api";

// GET /api/autonomy/policy — server-derived L0–L4 policy (labels + per-level
// can / requires-approval / denied action classes).
export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/autonomy/policy");
}