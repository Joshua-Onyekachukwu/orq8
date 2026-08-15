import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../lib/api";

// docs/23 — masked key list (GET) and save (POST); full keys only ever travel
// browser → web route handler → API, never stored or returned unmasked.
export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/providers/keys");
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, "/v1/providers/keys", { method: "POST", body });
}
