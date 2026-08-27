// ORQ8 Pricing Model
// Plans: Founder ($39/mo), Team ($99/mo), Company ($249/mo)
// Hybrid: platform subscription + included Work Credits + additional usage

export const PLANS = {
  founder: {
    name: "Founder",
    tagline: "Run your company with AI.",
    monthlyPrice: 3900, // cents
    annualPrice: 39000, // cents per year ($32.50/mo)
    includedCredits: 1000,
    maxAgents: 3,
    features: {
      executiveAgent: true,
      companyMemory: true,
      goalsAndTasks: true,
      approvalGates: "basic" as const,
      integrations: "core" as const,
      auditTrail: "basic" as const,
      analytics: "basic" as const,
      apiAccess: false,
      customAgents: "limited" as const,
      priorityExecution: false,
      teamCollaboration: false,
      advancedControls: false,
      prioritySupport: false,
    },
  },
  team: {
    name: "Team",
    tagline: "Build your AI workforce.",
    monthlyPrice: 9900, // cents
    annualPrice: 94800, // cents per year ($79/mo)
    includedCredits: 4000,
    maxAgents: 10,
    features: {
      executiveAgent: true,
      companyMemory: true,
      goalsAndTasks: true,
      approvalGates: "advanced" as const,
      integrations: "advanced" as const,
      auditTrail: "full" as const,
      analytics: "advanced" as const,
      apiAccess: true,
      customAgents: true,
      priorityExecution: true,
      teamCollaboration: true,
      advancedControls: false,
      prioritySupport: true,
    },
  },
  company: {
    name: "Company",
    tagline: "Operate your company through AI.",
    monthlyPrice: 24900, // cents
    annualPrice: 238800, // cents per year ($199/mo)
    includedCredits: 12000,
    maxAgents: 25,
    features: {
      executiveAgent: true,
      companyMemory: true,
      goalsAndTasks: true,
      approvalGates: "advanced" as const,
      integrations: "all" as const,
      auditTrail: "full" as const,
      analytics: "advanced" as const,
      apiAccess: true,
      customAgents: true,
      priorityExecution: true,
      teamCollaboration: true,
      advancedControls: true,
      prioritySupport: true,
    },
  },
} as const;

export type PlanId = keyof typeof PLANS;

// Work Credit packages for top-ups
export const CREDIT_PACKAGES = [
  { credits: 1000, priceCents: 1000, label: "1,000", price: "$10" },
  { credits: 5000, priceCents: 4000, label: "5,000", price: "$40" },
  { credits: 15000, priceCents: 10000, label: "15,000", price: "$100" },
  { credits: 50000, priceCents: 30000, label: "50,000", price: "$300" },
] as const;

// Trial configuration
export const TRIAL = {
  durationDays: 7,
  includedCredits: 750, // middle ground between 500-1000
} as const;

// Work Credit costs per operation type (in credits)
export const CREDIT_COSTS = {
  simpleTask: 5,
  researchTask: 25,
  complexWorkflow: 100,
  largeExecution: 500,
} as const;

// Usage warning thresholds
export const USAGE_THRESHOLDS = {
  warning: 0.8, // 80% - show warning
  limit: 1.0, // 100% - show limit reached
} as const;

// Get plan by ID
export function getPlan(planId: PlanId) {
  return PLANS[planId];
}

// Get monthly price for a plan (handle annual billing)
export function getMonthlyPrice(planId: PlanId, annual: boolean): number {
  const plan = PLANS[planId];
  if (annual) {
    return Math.round(plan.annualPrice / 12);
  }
  return plan.monthlyPrice;
}

// Calculate remaining credits
export function getRemainingCredits(
  included: number,
  purchased: number,
  used: number
): number {
  return Math.max(0, included + purchased - used);
}

// Check if usage is at warning level
export function isAtWarningLevel(
  included: number,
  purchased: number,
  used: number
): boolean {
  const total = included + purchased;
  return used / total >= USAGE_THRESHOLDS.warning;
}

// Check if usage is at limit
export function isAtLimit(
  included: number,
  purchased: number,
  used: number
): boolean {
  const total = included + purchased;
  return used / total >= USAGE_THRESHOLDS.limit;
}
