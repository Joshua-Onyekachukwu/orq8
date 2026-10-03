import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../lib/api";

// GET /api/credits/packs — the server-owned pack catalog (price + credits).
// The client never sends a price or quantity; it only names a pack.
export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/credits/packs");
}
