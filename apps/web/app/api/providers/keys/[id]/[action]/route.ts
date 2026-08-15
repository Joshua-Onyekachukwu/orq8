import { NextRequest, NextResponse } from "next/server";
import { proxyApiJson } from "../../../../../../lib/api";

const ACTIONS = new Set(["rotate", "revoke", "test"]);

// docs/23.4 — POST /api/providers/keys/:id/{rotate|revoke|test}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const { id, action } = await params;
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: { code: "validation.failed", message: "Unknown action" } }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, `/v1/providers/keys/${id}/${action}`, { method: "POST", body });
}
