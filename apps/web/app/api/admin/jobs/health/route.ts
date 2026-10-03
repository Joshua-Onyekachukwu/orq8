import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../../lib/api";

/** GET /api/admin/jobs/health — queue depth and worker liveness (platform admin). */
export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/admin/jobs/health");
}
