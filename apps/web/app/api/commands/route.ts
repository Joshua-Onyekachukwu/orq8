import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";

// POST /api/commands — Proxy CEO command to the ORQ8 API Executive Agent.
// The real orchestration happens on the Fastify backend (Executive Agent service).
// This route simply forwards the authenticated request.

export async function POST(request: NextRequest) {
  // Require authentication
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body?.command) {
    return NextResponse.json(
      { error: { code: "validation", message: "Please provide a command." } },
      { status: 400 }
    );
  }

  const command = body.command.trim();
  if (command.length < 3) {
    return NextResponse.json(
      { error: { code: "validation", message: "Please provide a more detailed command." } },
      { status: 400 }
    );
  }

  // Forward to the real Executive Agent on the API backend
  try {
    const res = await fetch(`${API_URL}/v1/commands`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE}=${token}`,
      },
      body: JSON.stringify({ command }),
    });

    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        data: {
          commandId: crypto.randomUUID(),
          command,
          plan: {
            action: "error",
            description: "Could not reach the ORQ8 Executive Agent",
            agents: [],
            estimatedCost: 0,
            requiresApproval: false,
            riskLevel: "low",
            taskDecomposition: [],
          },
          approvalRequest: null,
          status: "error",
          message: "The Executive Agent is currently unreachable. Please ensure the ORQ8 API is running.",
          taskIds: [],
          agentResults: [],
        },
      },
      { status: 200 }
    );
  }
}

// GET /api/commands/history — Proxy to get command history
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const limit = url.searchParams.get("limit") ?? "20";

  try {
    const res = await fetch(`${API_URL}/v1/commands/history?limit=${limit}`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });

    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ data: [] }, { status: 200 });
  }
}
