import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../lib/api";

/**
 * POST /api/demo-company/isolated — first-run demo in its OWN org (C-03/C-04).
 * Same-origin proxy to POST /v1/demo-company/isolated; the browser never
 * holds the API token directly. The API creates a separate "Northwind Labs
 * (Demo)" org, seeds it, flags it `isDemo`, and moves the session into it —
 * the founder's real org is never written to. A 409 `demo_exists` means the
 * founder already has a live demo org (its id rides in `data.orgId`).
 */
export async function POST(request: NextRequest) {
  return proxyApiJson(request, "/v1/demo-company/isolated", { method: "POST" });
}
