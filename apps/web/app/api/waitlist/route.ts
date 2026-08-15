import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

// POST /api/waitlist — public landing funnel (no session needed)
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, "/v1/waitlist", { method: "POST", body });
}
