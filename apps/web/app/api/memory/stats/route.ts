import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../lib/api";

// GET /api/memory/stats — memory statistics for the org
export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/memory/stats");
}
