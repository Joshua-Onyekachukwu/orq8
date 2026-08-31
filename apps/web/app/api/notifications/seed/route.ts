import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../lib/api";

// POST /api/notifications/seed — seed sample notifications for testing
export async function POST(request: NextRequest) {
  return proxyApiJson(request, "/v1/notifications/seed", { method: "POST" });
}
