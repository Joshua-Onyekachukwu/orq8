import { NextRequest, NextResponse } from "next/server";
import { API_URL, proxyApiJson } from "../../../lib/api";

/**
 * POST /api/executive-agent
 *
 * Proxies the founder's command to the Executive Agent on the Railway API.
 * The backend handles: context building, LLM intent analysis, task creation,
 * agent selection, approval gates, and audit trail.
 *
 * Security: session cookie is forwarded by proxyApiJson; the backend verifies
 * org ownership and authorization for every action.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { command, contextNote } = body;

    if (!command || typeof command !== "string" || command.trim().length === 0) {
      return NextResponse.json(
        { error: "Command is required" },
        { status: 400 },
      );
    }

    const data = await proxyApiJson(req, `${API_URL}/v1/commands`, {
      method: "POST",
      body: JSON.stringify({
        command: command.trim(),
        contextNote: contextNote ?? undefined,
      }),
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Executive Agent unavailable";
    console.error("[executive-agent] proxy error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
