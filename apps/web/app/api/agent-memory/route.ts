import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

/**
 * GET  /api/agent-memory?agentId=…&limit=… — what one employee knows/remembers.
 * POST /api/agent-memory                   — record an entry against an employee.
 *
 * Distinct from `/api/memory` (company-wide knowledge): this is the
 * agent-scoped store the runtime writes lessons and failures into, so the
 * employee workspace can show the founder the same memories the employee is
 * handed at execution time.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams.toString();
  return proxyApiJson(request, `/v1/agent-memory${params ? `?${params}` : ""}`);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, "/v1/agent-memory", { method: "POST", body });
}
