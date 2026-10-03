import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../../lib/api";

/** GET /api/admin/jobs/recent?status=&type=&limit= — recent agent_jobs rows. */
export async function GET(request: NextRequest) {
  const params = new URLSearchParams();
  for (const key of ["status", "type", "limit"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return proxyApiJson(request, `/v1/admin/jobs/recent${query ? `?${query}` : ""}`);
}
