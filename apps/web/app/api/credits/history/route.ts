import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../lib/api";

// GET /api/credits/history — the org's credit ledger (purchases, usage,
// refunds, adjustments), newest first, with a total for paging.
export async function GET(request: NextRequest) {
  const limit = request.nextUrl.searchParams.get("limit") ?? "50";
  const offset = request.nextUrl.searchParams.get("offset") ?? "0";
  return proxyApiJson(request, `/v1/credits/history?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`);
}
