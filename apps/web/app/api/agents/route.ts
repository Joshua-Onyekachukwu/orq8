import { NextRequest, NextResponse } from "next/server";
import { proxyApiJson } from "../../../lib/api";

// GET /api/agents — list all agents
export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/agents");
}

// POST /api/agents — hire a new agent
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, "/v1/agents", { method: "POST", body });
}
