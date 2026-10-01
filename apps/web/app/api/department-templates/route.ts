import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

/** GET /api/department-templates — the activatable department catalog. */
export async function GET(req: NextRequest) {
  return proxyApiJson(req, "/v1/department-templates");
}
