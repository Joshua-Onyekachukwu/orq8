import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

/**
 * POST /api/demo-company — founder-facing one-click demo company (MVP-020).
 * Same-origin proxy to POST /v1/demo-company; the browser never holds the
 * API token directly. Guards (owner/admin, empty org, once per org) live on
 * the API route; a 409 here means the company already has content.
 */
export async function POST(request: NextRequest) {
  return proxyApiJson(request, "/v1/demo-company", { method: "POST" });
}
