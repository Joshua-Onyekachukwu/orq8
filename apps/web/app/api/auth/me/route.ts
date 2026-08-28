import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../lib/api";

// GET /api/auth/me — get current authenticated user info
export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/auth/me");
}
