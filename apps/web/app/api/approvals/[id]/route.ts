import { NextRequest, NextResponse } from "next/server";

// In production, this would interact with the database
// This is a sample implementation that demonstrates the approval architecture

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await request.json().catch(() => null);

  if (!body || !body.action) {
    return NextResponse.json(
      { error: "Invalid request: action required" },
      { status: 400 }
    );
  }

  const { action, modifications } = body;

  if (!["approve", "reject", "modify"].includes(action)) {
    return NextResponse.json(
      { error: "Invalid action. Must be: approve, reject, or modify" },
      { status: 400 }
    );
  }

  // In production, this would:
  // 1. Verify the user is authorized to make this decision
  // 2. Update the approval status in the database
  // 3. Record the decision with timestamp
  // 4. Trigger the next step in the workflow (e.g., execute the approved action)

  const result = {
    id,
    action,
    status: action === "reject" ? "rejected" : action === "approve" ? "approved" : "modified",
    decidedAt: new Date().toISOString(),
    modifications: action === "modify" ? modifications : undefined,
    // In production, this would be the updated approval record
    message:
      action === "approve"
        ? `Approval ${id} approved. The agent will proceed with execution.`
        : action === "reject"
        ? `Approval ${id} rejected. The agent will not proceed.`
        : `Approval ${id} modified. The agent will review the changes.`,
  };

  return NextResponse.json({ data: result });
}
