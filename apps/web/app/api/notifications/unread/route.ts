import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../lib/api";

// GET /api/notifications/unread — get unread notification count
export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/notifications/unread");
}
