import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

/**
 * GET /api/tools            — the whole tool registry (id, category, risk, credit cost).
 * GET /api/tools?role=…     — only the tools that role may run (docs/71 §H "Abilities").
 *
 * The role variant is what the employee workspace needs: the registry has one
 * global list, while `getToolsForRole` is the same resolver the execution path
 * uses, so the screen and the runtime can never disagree about what an
 * employee can actually do.
 */
export async function GET(request: NextRequest) {
  const role = request.nextUrl.searchParams.get("role")?.trim();
  if (role) return proxyApiJson(request, `/v1/tools/role/${encodeURIComponent(role)}`);
  return proxyApiJson(request, "/v1/tools");
}
