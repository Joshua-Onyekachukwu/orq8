import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

// GET /api/memory — list memory entries with optional search/filtering
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const params = url.searchParams.toString();
  return proxyApiJson(request, `/v1/memory${params ? `?${params}` : ""}`);
}

// POST /api/memory — create a new memory entry
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, "/v1/memory", { method: "POST", body });
}
