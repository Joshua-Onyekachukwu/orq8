import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

// GET /api/attention — the founder's attention queue for the current org.
//
// Live data: the badge and the page refetch after every change, so this
// response must never be cached by the browser or the edge (the shared proxy
// helper adds a 30s read cache by default, which is right for reference lists
// but wrong for a queue whose whole job is to be current).
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const response = await proxyApiJson(request, "/v1/attention");
  response.headers.set("Cache-Control", "no-store");
  return response;
}
