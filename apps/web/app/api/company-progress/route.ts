import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

/**
 * GET /api/company-progress — real company progress from goals, tasks and
 * activity. `proxyApiJson` is the response; wrapping it returned `{}` with a
 * 200, which is why "blocked tasks" always read as zero on the dashboard.
 */
export async function GET(req: NextRequest) {
  return proxyApiJson(req, "/v1/company-progress");
}
