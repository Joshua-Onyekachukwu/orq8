import { NextRequest, NextResponse } from "next/server";

// Onboarding state management
// In production, this would be stored in the database
interface OnboardingState {
  userId: string;
  step: "organization" | "constitution" | "agents" | "complete";
  organization?: {
    name: string;
    description?: string;
    objective?: string;
  };
  constitution?: {
    type: "founder_led" | "growth" | "efficiency" | "custom";
    name: string;
    principles: string[];
  };
  agents?: Array<{
    role: string;
    name: string;
    description: string;
    selected: boolean;
  }>;
  completedAt?: string;
}

// In-memory store for demo purposes
// In production, this would be a database table
const onboardingStates: Map<string, OnboardingState> = new Map();

// GET /api/onboarding - Get current onboarding state
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const state = onboardingStates.get(userId);

  if (!state) {
    return NextResponse.json({
      data: {
        step: "organization",
        organization: null,
        constitution: null,
        agents: null,
      },
    });
  }

  return NextResponse.json({ data: state });
}

// POST /api/onboarding - Update onboarding state
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.userId || !body?.step) {
    return NextResponse.json(
      { error: "userId and step are required" },
      { status: 400 }
    );
  }

  const { userId, step, data } = body;

  // Get existing state or create new
  const existing = onboardingStates.get(userId) || {
    userId,
    step: "organization" as const,
  };

  // Update state
  const newState: OnboardingState = {
    ...existing,
    userId,
    step: step as OnboardingState["step"],
  };

  // Apply step-specific data
  if (step === "organization" && data) {
    newState.organization = data;
  } else if (step === "constitution" && data) {
    newState.constitution = data;
  } else if (step === "agents" && data) {
    newState.agents = data.agents;
    // If completing onboarding
    if (data.complete) {
      newState.step = "complete";
      newState.completedAt = new Date().toISOString();
    }
  }

  onboardingStates.set(userId, newState);

  return NextResponse.json({ data: newState });
}
