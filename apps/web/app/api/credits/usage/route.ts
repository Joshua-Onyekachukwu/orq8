import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../lib/api";

// GET /api/credits/usage — credit usage summary for the current period
export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/credits/usage");
}
