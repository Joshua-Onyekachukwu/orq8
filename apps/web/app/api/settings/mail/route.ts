import { proxyApiJson } from "../../../../lib/api";
import type { NextRequest } from "next/server";

// GET /api/settings/mail — how this deployment sends mail, and whether that
// adds up to delivery. Reads configuration only; never sends anything, so the
// settings page can render the truth without side effects.
// Session-scoped (it reports this deployment's configuration), never cached.
export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/settings/mail", { cache: "private" });
}
