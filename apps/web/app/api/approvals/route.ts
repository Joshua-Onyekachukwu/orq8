import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

// GET /api/approvals — list approval requests
export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/approvals");
}

// POST /api/approvals — create a new approval request (from command bar or agents)
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, "/v1/approvals", { method: "POST", body });
}
