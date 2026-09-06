import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

// GET /api/integrations — connected external providers for the org.
export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/integrations");
}
