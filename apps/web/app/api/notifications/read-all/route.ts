import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../lib/api";

// POST /api/notifications/read-all — mark all notifications as read
export async function POST(request: NextRequest) {
  return proxyApiJson(request, "/v1/notifications/read-all", { method: "POST" });
}
