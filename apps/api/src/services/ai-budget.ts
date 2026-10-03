/**
 * AI budget policy (docs/80 Phase 2).
 *
 * The company constitution already *stores* a `budgetPolicy`
 * (`organizations.settings.constitution.budgetPolicy`) and every playbook seeds
 * one — `{ dailyLimit, monthlyLimit, requiresApprovalAbove }` — but until now
 * nothing read it. This service is the single place that turns those stored
 * numbers, plus each employee's own `agents.config.budget`, into an enforced
 * decision.
 *
 * Units: **credits**, the same unit the balance, the ledger and the UI use.
 * `0` means "not set" for a ceiling (no limit) and "never" for
 * `requiresApprovalAbove`; a founder who wants a guard lowers the number rather
 * than the code.
 *
 * Enforcement happens at reservation (`services/credits.ts` → `reserveCredits`),
 * so every path that can spend credits is covered — the task executor, the
 * Executive Agent and any future caller. Two failure shapes:
 *
 *   - a hard ceiling or the org kill switch → `BudgetExceededError` (the work
 *     does not start, nothing is charged);
 *   - spend above `requiresApprovalAbove` → `BudgetApprovalRequiredError`, which
 *     the executor turns into a real approval that gates the task.
 */

import { eq, and, gte, sql } from 'drizzle-orm';
import { agents, creditTransactions, organizations, type Db } from '@orq8/db';
import { appendAudit } from './audit.js';
import { broadcastToOrg } from './realtime.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BudgetPolicy {
  /** Credits per UTC day before work is refused. 0 = no limit. */
  dailyLimit: number;
  /** Credits per calendar month (UTC) before work is refused. 0 = no limit. */
  monthlyLimit: number;
  /** Spend above this opens an approval instead of running. 0 = never. */
  requiresApprovalAbove: number;
}

export interface AgentBudget {
  /** Credits per UTC day for this employee. 0 = inherit the org policy. */
  dailyCredits: number;
  /** Credits per calendar month for this employee. 0 = no limit. */
  monthlyCredits: number;
  /** Hard per-task ceiling for this employee (above it, the task is refused). 0 = no limit. */
  perTaskCredits: number;
}

export interface KillSwitchState {
  paused: boolean;
  reason: string | null;
  /** ISO timestamp the switch last changed. */
  at: string | null;
  /** User id that flipped it. */
  by: string | null;
}

export type BudgetBlockReason =
  | 'kill_switch'
  | 'org_daily_limit'
  | 'org_monthly_limit'
  | 'agent_daily_limit'
  | 'agent_monthly_limit'
  | 'agent_per_task_ceiling';

export interface BudgetEvaluation {
  allowed: boolean;
  /** Set when a hard ceiling refuses the work. */
  reason?: BudgetBlockReason;
  /** Set when the spend exceeds `requiresApprovalAbove` (still can run once approved). */
  approvalRequired: boolean;
  policy: BudgetPolicy;
  killSwitch: KillSwitchState;
  estimate: number;
  orgSpentToday: number;
  orgSpentMonth: number;
  /** Present when an agent id was supplied. */
  agentBudget?: AgentBudget;
  agentSpentToday?: number;
  agentSpentMonth?: number;
  /** Human-readable explanation, safe to surface in an activity event. */
  detail: string;
}

export interface BudgetOverview {
  policy: BudgetPolicy;
  killSwitch: KillSwitchState;
  orgSpentToday: number;
  orgSpentMonth: number;
  orgAvailable: number | null;
  threshold: number;
  agents: Array<{
    id: string;
    name: string;
    role: string;
    status: string;
    budget: AgentBudget;
    spentToday: number;
    spentMonth: number;
  }>;
}

// ─── Resolution (pure) ──────────────────────────────────────────────────────

export const DEFAULT_BUDGET_POLICY: BudgetPolicy = {
  dailyLimit: 0,
  monthlyLimit: 0,
  requiresApprovalAbove: 0,
};

export const DEFAULT_AGENT_BUDGET: AgentBudget = {
  dailyCredits: 0,
  monthlyCredits: 0,
  perTaskCredits: 0,
};

/** Coerce an unknown stored value to a non-negative whole number; invalid → 0. */
function toCredits(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Read `organizations.settings.constitution.budgetPolicy` defensively. */
export function resolveBudgetPolicy(settings: unknown): BudgetPolicy {
  const s = (settings ?? {}) as Record<string, unknown>;
  const constitution = (s.constitution ?? {}) as Record<string, unknown>;
  const bp = (constitution.budgetPolicy ?? {}) as Record<string, unknown>;
  return {
    dailyLimit: toCredits(bp.dailyLimit),
    monthlyLimit: toCredits(bp.monthlyLimit),
    requiresApprovalAbove: toCredits(bp.requiresApprovalAbove),
  };
}

/** Read `agents.config.budget`; absent fields mean "no per-agent ceiling". */
export function resolveAgentBudget(config: unknown): AgentBudget {
  const s = (config ?? {}) as Record<string, unknown>;
  const b = (s.budget ?? {}) as Record<string, unknown>;
  return {
    dailyCredits: toCredits(b.dailyCredits),
    monthlyCredits: toCredits(b.monthlyCredits),
    perTaskCredits: toCredits(b.perTaskCredits),
  };
}

/** Read the org AI-spend kill switch from `organizations.settings.aiSpend`. */
export function readKillSwitch(settings: unknown): KillSwitchState {
  const s = (settings ?? {}) as Record<string, unknown>;
  const k = (s.aiSpend ?? {}) as Record<string, unknown>;
  return {
    paused: k.paused === true,
    reason: typeof k.reason === 'string' ? k.reason : null,
    at: typeof k.at === 'string' ? k.at : null,
    by: typeof k.by === 'string' ? k.by : null,
  };
}

// ─── Spend windows ──────────────────────────────────────────────────────────

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Measured spend (credits) since `since`, from the append-only ledger. Counts
 * `usage` rows only — refunds returned credits, and a hold in flight has not
 * settled, so neither is spend.
 */
async function sumSpend(
  db: Db,
  orgId: string,
  since: Date,
  agentId?: string,
): Promise<number> {
  const conditions = [
    eq(creditTransactions.orgId, orgId),
    eq(creditTransactions.type, 'usage'),
    gte(creditTransactions.createdAt, since),
  ];
  if (agentId) conditions.push(eq(creditTransactions.agentId, agentId));
  const [row] = await db
    .select({ spent: sql<number>`COALESCE(SUM(-${creditTransactions.amount}), 0)::int` })
    .from(creditTransactions)
    .where(and(...conditions));
  return row?.spent ?? 0;
}

async function loadOrgSettings(db: Db, orgId: string): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return (row?.settings as Record<string, unknown> | null) ?? null;
}

// ─── Evaluation ─────────────────────────────────────────────────────────────

export interface EvaluateBudgetInput {
  orgId: string;
  /** Estimated credits the work will cost. */
  estimate: number;
  agentId?: string;
  now?: Date;
}

/**
 * The one budget decision. Reads the stored policy (and the agent's, when an
 * agent is named), measures real spend, and reports whether the work may start
 * and whether it needs a founder's approval first.
 */
export async function evaluateBudget(
  db: Db,
  input: EvaluateBudgetInput,
): Promise<BudgetEvaluation> {
  const now = input.now ?? new Date();
  const estimate = Math.max(0, Math.round(input.estimate));
  const settings = await loadOrgSettings(db, input.orgId);
  const policy = resolveBudgetPolicy(settings);
  const killSwitch = readKillSwitch(settings);

  const dayStart = startOfUtcDay(now);
  const monthStart = startOfUtcMonth(now);
  const orgSpentToday = await sumSpend(db, input.orgId, dayStart);
  const orgSpentMonth = await sumSpend(db, input.orgId, monthStart);

  const base: BudgetEvaluation = {
    allowed: true,
    approvalRequired: policy.requiresApprovalAbove > 0 && estimate > policy.requiresApprovalAbove,
    policy,
    killSwitch,
    estimate,
    orgSpentToday,
    orgSpentMonth,
    detail: '',
  };

  if (killSwitch.paused) {
    return {
      ...base,
      allowed: false,
      reason: 'kill_switch',
      detail:
        'AI spend is paused for this organization by the founder. Resume it in Settings → Budgets to run more work.',
    };
  }

  if (policy.dailyLimit > 0 && orgSpentToday + estimate > policy.dailyLimit) {
    return {
      ...base,
      allowed: false,
      reason: 'org_daily_limit',
      detail: `Daily budget reached: ${orgSpentToday} spent today, this work needs ${estimate}, the daily limit is ${policy.dailyLimit} credits.`,
    };
  }

  if (policy.monthlyLimit > 0 && orgSpentMonth + estimate > policy.monthlyLimit) {
    return {
      ...base,
      allowed: false,
      reason: 'org_monthly_limit',
      detail: `Monthly budget reached: ${orgSpentMonth} spent this month, this work needs ${estimate}, the monthly limit is ${policy.monthlyLimit} credits.`,
    };
  }

  // Per-agent budgets. Absent `agents.config.budget` → no per-agent ceiling.
  if (input.agentId) {
    const [agent] = await db
      .select({ config: agents.config })
      .from(agents)
      .where(and(eq(agents.id, input.agentId), eq(agents.orgId, input.orgId)))
      .limit(1);

    if (agent) {
      const agentBudget = resolveAgentBudget(agent.config);
      const agentSpentToday = await sumSpend(db, input.orgId, dayStart, input.agentId);
      const agentSpentMonth = await sumSpend(db, input.orgId, monthStart, input.agentId);
      base.agentBudget = agentBudget;
      base.agentSpentToday = agentSpentToday;
      base.agentSpentMonth = agentSpentMonth;

      if (agentBudget.perTaskCredits > 0 && estimate > agentBudget.perTaskCredits) {
        return {
          ...base,
          allowed: false,
          reason: 'agent_per_task_ceiling',
          detail: `Per-task budget reached for this employee: the work is estimated at ${estimate} credits, the per-task ceiling is ${agentBudget.perTaskCredits}.`,
        };
      }
      if (agentBudget.dailyCredits > 0 && agentSpentToday + estimate > agentBudget.dailyCredits) {
        return {
          ...base,
          allowed: false,
          reason: 'agent_daily_limit',
          detail: `Daily budget reached for this employee: ${agentSpentToday} spent today, this work needs ${estimate}, the limit is ${agentBudget.dailyCredits} credits.`,
        };
      }
      if (agentBudget.monthlyCredits > 0 && agentSpentMonth + estimate > agentBudget.monthlyCredits) {
        return {
          ...base,
          allowed: false,
          reason: 'agent_monthly_limit',
          detail: `Monthly budget reached for this employee: ${agentSpentMonth} spent this month, this work needs ${estimate}, the limit is ${agentBudget.monthlyCredits} credits.`,
        };
      }
    }
  }

  if (base.approvalRequired) {
    base.detail = `This work is estimated at ${estimate} credits, above the organization's approval threshold of ${policy.requiresApprovalAbove}. A founder must approve it before it runs.`;
  } else {
    base.detail = `Within budget: ${estimate} credits estimated.`;
  }

  return base;
}

// ─── Overview (for the budgets page / kill-switch UI) ───────────────────────

/** Policy + measured spend + each employee's own budget, for the UI. */
export async function getBudgetOverview(
  db: Db,
  orgId: string,
  now: Date = new Date(),
): Promise<BudgetOverview> {
  const settings = await loadOrgSettings(db, orgId);
  const policy = resolveBudgetPolicy(settings);
  const killSwitch = readKillSwitch(settings);

  const dayStart = startOfUtcDay(now);
  const monthStart = startOfUtcMonth(now);
  const orgSpentToday = await sumSpend(db, orgId, dayStart);
  const orgSpentMonth = await sumSpend(db, orgId, monthStart);

  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      role: agents.role,
      status: agents.status,
      config: agents.config,
    })
    .from(agents)
    .where(eq(agents.orgId, orgId))
    .limit(500);

  const agentRows: BudgetOverview['agents'] = [];
  for (const row of rows) {
    agentRows.push({
      id: row.id,
      name: row.name,
      role: row.role,
      status: row.status,
      budget: resolveAgentBudget(row.config),
      spentToday: await sumSpend(db, orgId, dayStart, row.id),
      spentMonth: await sumSpend(db, orgId, monthStart, row.id),
    });
  }

  let orgAvailable: number | null = null;
  try {
    const { getOrCreateBalance } = await import('./credits.js');
    orgAvailable = (await getOrCreateBalance(db, orgId)).available;
  } catch {
    orgAvailable = null;
  }

  return {
    policy,
    killSwitch,
    orgSpentToday,
    orgSpentMonth,
    orgAvailable,
    threshold: policy.requiresApprovalAbove,
    agents: agentRows,
  };
}

// ─── Kill switch ────────────────────────────────────────────────────────────

/**
 * Flip the org AI-spend kill switch. Reads the stored row first and merges, so
 * other `settings` keys (constitution, onboarding, …) are never clobbered.
 */
export async function setKillSwitch(
  db: Db,
  orgId: string,
  paused: boolean,
  actor: { userId: string; reason?: string },
): Promise<KillSwitchState> {
  const settings = (await loadOrgSettings(db, orgId)) ?? {};
  const next: KillSwitchState = {
    paused,
    reason: paused ? (actor.reason?.trim() || 'Paused by founder') : null,
    at: new Date().toISOString(),
    by: actor.userId,
  };

  await db
    .update(organizations)
    .set({ settings: { ...settings, aiSpend: next } })
    .where(eq(organizations.id, orgId));

  await appendAudit(db, {
    orgId,
    actorType: 'user',
    actorId: actor.userId,
    action: paused ? 'ai_spend.paused' : 'ai_spend.resumed',
    outcome: 'success',
    cost: 0,
    resultRef: next.reason ?? undefined,
  }).catch(() => undefined);

  broadcastToOrg(orgId, {
    type: 'ai_spend.paused',
    paused,
  });

  return next;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

/** A hard ceiling (or the kill switch) refused the work before it started. */
export class BudgetExceededError extends Error {
  constructor(
    public readonly orgId: string,
    public readonly budgetReason: BudgetBlockReason,
    public readonly detail: string,
    public readonly required: number,
  ) {
    super(detail);
    this.name = 'BudgetExceededError';
  }
}

/** The work is over the approval threshold and needs a founder's decision. */
export class BudgetApprovalRequiredError extends Error {
  constructor(
    public readonly orgId: string,
    public readonly estimate: number,
    public readonly threshold: number,
    public readonly detail: string,
  ) {
    super(detail);
    this.name = 'BudgetApprovalRequiredError';
  }
}
