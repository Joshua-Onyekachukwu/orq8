import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../lib/api";

// GET /api/billing/limits — current plan, agent usage vs cap, credit balance,
// and the next plan in the upgrade path (powers the upgrade buttons).
export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/billing/limits");
}
