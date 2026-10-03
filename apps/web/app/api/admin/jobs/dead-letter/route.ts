import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../../lib/api";

/** GET /api/admin/jobs/dead-letter?limit= — jobs that will not run again on their own. */
export async function GET(request: NextRequest) {
  const limit = request.nextUrl.searchParams.get("limit");
  return proxyApiJson(request, `/v1/admin/jobs/dead-letter${limit ? `?limit=${limit}` : ""}`);
}
