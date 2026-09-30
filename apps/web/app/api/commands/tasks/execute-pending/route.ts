import { proxyApiJson } from "../../../../../lib/api";
import type { NextRequest } from "next/server";

// POST /api/commands/tasks/execute-pending — run this company's queued work.
//
// The batch runner in the API had no caller at all (docs/66 §66.14): queued work
// moved only when someone asked for one task by name, and only through curl.
// Work waiting on a founder's decision is excluded by construction — it is in
// `awaiting_approval`, not `pending` — so this can be pressed without answering
// a question on the founder's behalf.
export async function POST(request: NextRequest) {
  return proxyApiJson(request, "/v1/commands/tasks/execute-pending", {
    method: "POST",
    body: {},
  });
}
