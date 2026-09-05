import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/departments");
}

// POST /api/departments — create a department directly
// (The Founder manages departments directly — no Executive Agent required.)
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, "/v1/departments", { method: "POST", body });
}
