import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

/** GET /api/agent-templates — the hireable agent catalog. */
export async function GET(req: NextRequest) {
  return proxyApiJson(req, "/v1/agent-templates");
}
