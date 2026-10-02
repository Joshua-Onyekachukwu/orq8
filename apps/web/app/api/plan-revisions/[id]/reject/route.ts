import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../../lib/api";

// POST /api/plan-revisions/[id]/reject — founder declines a draft revision.
// Only unratified drafts can be rejected; the current direction is untouched.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyApiJson(request, `/v1/plan-revisions/${id}/reject`, {
    method: "POST",
    body,
  });
}
