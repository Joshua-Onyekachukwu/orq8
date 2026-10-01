import { NextRequest, NextResponse } from "next/server";
import { proxyApiJson } from "../../../../../lib/api";

// PATCH /api/notifications/[id]/read — mark one notification as read.
// The page's per-row "Mark read" was silent because this proxy did not exist:
// the browser got a 404 from Next before the API ever saw the request.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyApiJson(request, `/v1/notifications/${id}/read`, { method: "PATCH" });
}
