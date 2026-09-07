import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

// GET /api/connector-actions — connector outcome evidence (safe subset).
export async function GET(request: NextRequest) {
  const qs = request.nextUrl.searchParams.toString();
  return proxyApiJson(request, qs ? `/v1/connector-actions?${qs}` : "/v1/connector-actions");
}

// POST /api/connector-actions — run a connector action (autonomy-gated server-side).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, "/v1/connector-actions", { method: "POST", body });
}