import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

// GET /api/teams — list teams for the org
export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/teams");
}

// POST /api/teams — create a team
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, "/v1/teams", { method: "POST", body });
}