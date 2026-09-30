import { proxyApiJson } from "../../../../../../lib/api";
import type { NextRequest } from "next/server";

// POST /api/commands/tasks/:taskId/retry — re-run a task the system stopped.
// The API refuses work a person already settled (409) and the message it returns
// is what the founder sees, so a refusal here is an explanation, not a dead end.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  return proxyApiJson(request, `/v1/commands/tasks/${encodeURIComponent(taskId)}/retry`, {
    method: "POST",
    body: {},
  });
}
