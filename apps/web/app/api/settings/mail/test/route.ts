import { proxyApiJson } from "../../../../../lib/api";
import type { NextRequest } from "next/server";

// POST /api/settings/mail/test — send one real message and report what happened
// at each step. POST, never GET: this has a side effect and must not be
// something a cache or a prefetch can trigger.
// The API restricts it to owners and admins.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, "/v1/settings/mail/test", {
    method: "POST",
    body: body ?? {},
  });
}
