import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../../lib/api";

// POST /api/plan-revisions/[id]/ratify — founder ratifies a draft revision.
// The previously ratified revision steps down; this one becomes direction.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyApiJson(request, `/v1/plan-revisions/${id}/ratify`, {
    method: "POST",
    body,
  });
}
