import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL = process.env.API_URL || "http://localhost:3001";

// Sample approval data - in production this would come from the database
let approvalRequests = [
  {
    id: "RQ-1042",
    agent: "Marketing Specialist",
    agentInitials: "MS",
    what: "Launch LinkedIn campaign targeting Series A founders",
    cost: 250,
    reason: "Q3 pipeline goal requires 50 new qualified leads",
    risk: "low",
    reversible: true,
    status: "awaiting" as const,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "RQ-1041",
    agent: "Engineer",
    agentInitials: "EN",
    what: "Deploy PR #142 (database index optimization)",
    cost: 0,
    reason: "Query performance has degraded 40% over the last week",
    risk: "low",
    reversible: true,
    status: "awaiting" as const,
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "RQ-1040",
    agent: "Writer",
    agentInitials: "WR",
    what: "Publish launch blog post v2",
    cost: 0,
    reason: "Post drafted and reviewed, ready for publication",
    risk: "low",
    reversible: true,
    status: "approved" as const,
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    decidedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "RQ-1039",
    agent: "Researcher",
    agentInitials: "RS",
    what: "Purchase competitor pricing dataset ($40)",
    cost: 40,
    reason: "Market analysis requires current competitor pricing data",
    risk: "low",
    reversible: false,
    status: "rejected" as const,
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    decidedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "RQ-1038",
    agent: "Engineer",
    agentInitials: "EN",
    what: "Add API rate limiting to prevent abuse",
    cost: 0,
    reason: "Security audit identified missing rate limiting on public endpoints",
    risk: "low",
    reversible: true,
    status: "awaiting" as const,
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "RQ-1037",
    agent: "Writer",
    agentInitials: "WR",
    what: "Draft investor update for Q3 progress",
    cost: 0,
    reason: "Quarterly update due next Monday, needs CEO review before sending",
    risk: "low",
    reversible: true,
    status: "awaiting" as const,
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
];

// GET /api/approvals - List all approval requests
export async function GET(request: NextRequest) {
  // In production, this would verify the session and fetch from the database
  // const cookieStore = await cookies();
  // const token = cookieStore.get('session')?.value;
  // if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search")?.toLowerCase();

  let filtered = [...approvalRequests];

  if (status && status !== "all") {
    filtered = filtered.filter((r) => r.status === status);
  }

  if (search) {
    filtered = filtered.filter(
      (r) =>
        r.id.toLowerCase().includes(search) ||
        r.agent.toLowerCase().includes(search) ||
        r.what.toLowerCase().includes(search)
    );
  }

  return NextResponse.json({ data: filtered });
}

// POST /api/approvals - Create a new approval request
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const newRequest = {
    id: `RQ-${1000 + approvalRequests.length + 1}`,
    agent: body.agent || "Executive Agent",
    agentInitials: body.agentInitials || "EA",
    what: body.what,
    cost: body.cost || 0,
    reason: body.reason || "",
    risk: body.risk || "low",
    reversible: body.reversible ?? true,
    status: "awaiting" as const,
    createdAt: new Date().toISOString(),
  };

  approvalRequests.unshift(newRequest);

  return NextResponse.json({ data: newRequest }, { status: 201 });
}
