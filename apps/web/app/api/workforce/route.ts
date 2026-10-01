import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

/**
 * GET /api/workforce — org-wide workforce summary.
 *
 * `proxyApiJson` *is* the response (it already carries the upstream status,
 * body and cache headers). This route used to wrap it twice —
 * `NextResponse.json(await proxyApiJson(...))` — which serializes a Response
 * object and answers `{}` with a 200, and it passed a full URL where the helper
 * expects a path, so the upstream fetch never even resolved. Every consumer
 * (department coverage, utilization, the org summary) silently read empty data.
 */
export async function GET(req: NextRequest) {
  return proxyApiJson(req, "/v1/workforce/summary");
}
