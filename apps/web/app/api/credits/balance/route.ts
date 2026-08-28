import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../lib/api";

// GET /api/credits/balance — current credit balance for the org
export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/credits/balance");
}
