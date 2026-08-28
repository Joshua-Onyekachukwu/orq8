import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

// GET /api/notifications — list notifications for the current org
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const params = url.searchParams.toString();
  return proxyApiJson(request, `/v1/notifications${params ? `?${params}` : ""}`);
}
