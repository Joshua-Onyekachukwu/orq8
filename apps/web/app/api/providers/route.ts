import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

// GET /api/providers — provider catalog with per-org connected status (masked only)
export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/providers");
}
