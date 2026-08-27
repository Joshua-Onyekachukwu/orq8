import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

// GET /api/dashboard — dashboard summary stats
export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/dashboard");
}
