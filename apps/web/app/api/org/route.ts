import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

// GET /api/org — current organization details
export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/org");
}

// PATCH /api/org — update organization details (name)
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, "/v1/org", { method: "PATCH", body });
}