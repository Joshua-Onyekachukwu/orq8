import { NextRequest, NextResponse } from "next/server";
import { proxyApiJson } from "../../../lib/api";

/**
 * POST /api/executive-agent
 *
 * Proxies the founder's command to the Executive Agent on the ORQ8 API.
 * The backend handles: context building, LLM intent analysis, task creation,
 * agent selection, approval gates, and audit trail.
 *
 * Security: the session cookie is forwarded by proxyApiJson; the backend
 * verifies org ownership and authorization for every action.
 *
 * Two bugs lived here and cancelled out into a silent success: the helper was
 * given a full URL (it prepends API_URL, so the fetch never resolved), the body
 * was pre-stringified (it stringifies again, so the API would receive a quoted
 * string), and its response was re-wrapped in NextResponse.json — which
 * serializes a Response object and answers `{}`. The UI therefore posted the
 * founder's command and got an empty 200 back.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { command, contextNote } = (body ?? {}) as {
    command?: unknown;
    contextNote?: unknown;
  };

  if (!command || typeof command !== "string" || command.trim().length === 0) {
    return NextResponse.json({ error: "Command is required" }, { status: 400 });
  }

  return proxyApiJson(req, "/v1/commands", {
    method: "POST",
    body: { command: command.trim(), contextNote: contextNote ?? undefined },
  });
}
