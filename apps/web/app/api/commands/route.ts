import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";

// SECURITY: This endpoint requires authentication.
// The command bar is a privileged interface that can trigger AI actions.

interface CommandPlan {
  action: string;
  description: string;
  agents?: string[];
  estimatedCost?: number;
  requiresApproval: boolean;
  approvalReason?: string;
}

/**
 * Verify the request is authenticated via session cookie.
 * Returns the authenticated user context or null if unauthorized.
 */
async function requireAuth(request: NextRequest): Promise<{ userId: string; orgId: string } | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/v1/auth/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: { user?: { id?: string }; active_org_id?: string };
    };
    const userId = data?.data?.user?.id;
    const orgId = data?.data?.active_org_id;
    if (!userId || !orgId) return null;
    return { userId, orgId };
  } catch {
    return null;
  }
}

// In production, this would connect to the Executive Agent orchestration layer
// For now, we provide a clear interface that the real agent can connect to later

function analyzeCommand(input: string): CommandPlan {
  const lower = input.toLowerCase();

  // Check for actions requiring approval (financial, public-facing, irreversible)
  const needsApproval =
    lower.includes("send") ||
    lower.includes("publish") ||
    lower.includes("deploy") ||
    lower.includes("buy") ||
    lower.includes("purchase") ||
    lower.includes("delete") ||
    lower.includes("remove") ||
    lower.includes("hire");

  // Determine the action type
  let action = "execute";
  let description = "";
  let agents: string[] = [];
  let estimatedCost = 0;

  if (lower.includes("research") || lower.includes("analyze") || lower.includes("investigate")) {
    action = "research";
    description = `Conduct research on: ${input}`;
    agents = ["Researcher"];
  } else if (lower.includes("write") || lower.includes("draft") || lower.includes("create content")) {
    action = "write";
    description = `Create content: ${input}`;
    agents = ["Writer"];
  } else if (lower.includes("send") || lower.includes("email") || lower.includes("notify")) {
    action = "communicate";
    description = `Send communication: ${input}`;
    agents = ["Communications Agent"];
    estimatedCost = lower.includes("newsletter") ? 50 : 0;
  } else if (lower.includes("deploy") || lower.includes("release")) {
    action = "deploy";
    description = `Deploy: ${input}`;
    agents = ["Engineer"];
  } else if (lower.includes("report") || lower.includes("summary")) {
    action = "report";
    description = `Generate report: ${input}`;
    agents = ["Executive Agent"];
  } else {
    action = "plan";
    description = `Create plan for: ${input}`;
    agents = ["Executive Agent"];
  }

  return {
    action,
    description,
    agents,
    estimatedCost,
    requiresApproval: needsApproval,
    approvalReason: needsApproval
      ? `This action involves ${action === "communicate" ? "sending external communications" : action === "deploy" ? "deploying to production" : action === "research" ? "external data acquisition" : "significant resource usage"}. Please review before proceeding.`
      : undefined,
  };
}

// POST /api/commands - Process a natural language command (requires authentication)
export async function POST(request: NextRequest) {
  // SECURITY: Require authentication before processing any command
  const auth = await requireAuth(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);

  if (!body?.command) {
    return NextResponse.json(
      { error: "Please provide a command." },
      { status: 400 }
    );
  }

  const command = body.command.trim();
  if (command.length < 3) {
    return NextResponse.json(
      { error: "Please provide a more detailed command." },
      { status: 400 }
    );
  }

  // In production, this would call the Executive Agent orchestration layer
  // The agent would analyze the command, create a plan, and determine if approval is needed
  const plan = analyzeCommand(command);

  // Create a real approval request via the backend API
  let approvalRequest = null;
  if (plan.requiresApproval) {
    try {
      const token = request.cookies.get(SESSION_COOKIE)?.value;
      if (token) {
        const approvalRes = await fetch(`${API_URL}/v1/approvals`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: `${SESSION_COOKIE}=${token}`,
          },
          body: JSON.stringify({
            action: plan.description,
            description: plan.approvalReason || null,
            cost: (plan.estimatedCost || 0) * 100, // convert to cents
            risk_level: "medium",
          }),
        });
        if (approvalRes.ok) {
          const approvalData = (await approvalRes.json()) as { data?: { id: string; action: string; cost: number; riskLevel: string; status: string; createdAt: string } };
          approvalRequest = approvalData?.data ?? null;
        }
      }
    } catch {
      // Approval creation failed — continue without approval
    }
  }

  return NextResponse.json({
    data: {
      command,
      plan: {
        action: plan.action,
        description: plan.description,
        agents: plan.agents,
        estimatedCost: plan.estimatedCost,
        requiresApproval: plan.requiresApproval,
      },
      approvalRequest,
      status: plan.requiresApproval
        ? "awaiting_approval"
        : "ready_to_execute",
      message: plan.requiresApproval
        ? `The Executive Agent has created an approval request. Please review before proceeding.`
        : `The Executive Agent is ready to execute. ${plan.agents?.join(", ")} will handle this task.`,
    },
  });
}
