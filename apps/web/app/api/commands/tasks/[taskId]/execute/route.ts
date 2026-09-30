import { proxyApiJson } from "../../../../../../lib/api";
import type { NextRequest } from "next/server";

// POST /api/commands/tasks/:taskId/execute — run one task now, from the product.
// The founder should never need curl to make their own company work.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  return proxyApiJson(request, `/v1/commands/tasks/${encodeURIComponent(taskId)}/execute`, {
    method: "POST",
    body: {},
  });
}
