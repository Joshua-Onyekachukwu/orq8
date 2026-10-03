import { eq, and, desc, gte, lte, lt, sql } from 'drizzle-orm';
import {
  agents,
  creditBalances,
  creditReservations,
  creditTransactions,
  subscriptions,
  tasks,
  type CreditReservation,
  type Db,
} from '@orq8/db';
import { appendAudit } from './audit.js';
import {
  evaluateBudget,
  BudgetExceededError,
  BudgetApprovalRequiredError,
} from './ai-budget.js';

// Re-exported so callers that already import credit primitives can catch the
// budget failures without a second import.
export { BudgetExceededError, BudgetApprovalRequiredError };

// ─── Plan Credit Allocation ─────────────────────────────────────────────────

/**
 * Credit allocation per plan per billing cycle.
 * 1 credit ≈ 1 standard LLM operation (research, write, analyze).
 * Complex operations (multi-step research, code generation) may cost 2-5 credits.
 */
export const PLAN_CREDITS: Record<string, number> = {
  trial: 100,
  founder: 1_000,
  team: 4_000,
  company: 12_000,
  enterprise: 50_000,
};

/**
 * Credit cost per operation type.
 * Maps operation categories to their credit cost.
 */
export const OPERATION_COSTS: Record<string, number> = {
  // Low-cost operations
  'task.planned': 1,
  'task.created': 1,
  'research.quick': 1,
  'analysis.quick': 1,

  // Standard operations
  'task.executed': 2,
  'task.research': 2,
  'task.write': 2,
  'task.plan': 2,
  'task.analyze': 2,
  'task.communicate': 2,
  'task.execute': 2,
  'task.report': 2,
  'task.manage': 2,
  'research.standard': 2,
  'analysis.standard': 2,
  'writing.standard': 2,
  'planning.standard': 2,

  // High-cost operations
  'research.deep': 5,
  'analysis.deep': 5,
  'writing.long': 5,
  'code.generation': 5,
  'code.review': 3,

  // Communication (external = more expensive)
  'communication.internal': 2,
  'communication.external': 5,

  // Default
  'default': 2,
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CreditBalanceInfo {
  orgId: string;
  /** The active subscription plan (`trial`, `founder`, `team`, `company`, …). */
  plan: string;
  included: number;
  purchased: number;
  used: number;
  /** Credits held by active reservations (docs/80 Phase 1). */
  reserved: number;
  /** `available` — total − used − reserved. Kept named `remaining` for callers. */
  remaining: number;
  /** Same as `remaining`, named explicitly for the reservation code paths. */
  available: number;
  total: number;
  utilizationPercent: number;
  periodStart: Date;
  periodEnd: Date;
  daysRemaining: number;
  isLow: boolean; // < 20% remaining
  isCritical: boolean; // < 5% remaining
}

export interface CreditTransactionRecord {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  referenceId: string | null;
  referenceType: string | null;
  createdAt: Date;
}

export interface CreditUsageSummary {
  totalUsed: number;
  byOperation: Array<{ type: string; count: number; totalCost: number }>;
  /** Spend per goal, derived from the `task:<id>` usage lines' goals. */
  byGoal: Array<{ goalId: string; title: string; count: number; totalCost: number; taskCount: number }>;
  /** Spend attributed to an agent through `reference_type: 'agent'` usage lines. */
  byAgent: Array<{ agentId: string; agentName: string; totalCost: number }>;
  dailyUsage: Array<{ date: string; cost: number }>;
  period: { start: Date; end: Date };
}

// ─── Core Credit Operations ─────────────────────────────────────────────────

/**
 * Get or create the current credit balance for an organization.
 * If no balance exists for the current billing period, creates one
 * based on the organization's subscription plan.
 */
export async function getOrCreateBalance(
  db: Db,
  orgId: string,
): Promise<CreditBalanceInfo> {
  const now = new Date();

  // Determine current billing period
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Find or create the active subscription
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.orgId, orgId),
        eq(subscriptions.status, 'active'),
      ),
    )
    .limit(1);

  let subId: string;
  let subPlan: string;
  let subIncludedCredits: number;

  if (sub) {
    subId = sub.id;
    subPlan = sub.plan;
    subIncludedCredits = sub.includedCredits;

    // Check if we need to roll over to a new period
    if (sub.currentPeriodEnd < now) {
      const includedCredits = PLAN_CREDITS[sub.plan] ?? PLAN_CREDITS.trial;

      const [newSub] = await db
        .update(subscriptions)
        .set({
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          includedCredits,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, sub.id))
        .returning();

      if (newSub) {
        subIncludedCredits = newSub.includedCredits;
      }

      // Reset credit balance for new period
      const [existingBalance] = await db
        .select()
        .from(creditBalances)
        .where(
          and(
            eq(creditBalances.orgId, orgId),
            gte(creditBalances.periodStart, periodStart),
          ),
        )
        .limit(1);

      if (!existingBalance) {
        // onConflictDoNothing + the unique (org, period_start) index (migration
        // 0015) means two concurrent rollovers cannot create two balances.
        await db.insert(creditBalances).values({
          orgId,
          subscriptionId: subId,
          includedCredits: subIncludedCredits,
          purchasedCredits: 0,
          usedCredits: 0,
          periodStart,
          periodEnd,
        }).onConflictDoNothing();

        await db.insert(creditTransactions).values({
          orgId,
          type: 'rollover',
          amount: subIncludedCredits,
          description: `Monthly credit allocation for ${subPlan} plan`,
          referenceId: subId,
          referenceType: 'subscription',
        });
      }
    }
  } else {
    // Create a trial subscription
    const [created] = await db
      .insert(subscriptions)
      .values({
        orgId,
        plan: 'trial',
        billingCycle: 'monthly',
        status: 'active',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        includedCredits: PLAN_CREDITS.trial,
        maxAgents: 3,
      })
      .returning();

    subId = created!.id;
    subPlan = 'trial';
    subIncludedCredits = PLAN_CREDITS.trial ?? 100;

    await db.insert(creditBalances).values({
      orgId,
      subscriptionId: subId,
      includedCredits: subIncludedCredits,
      purchasedCredits: 0,
      usedCredits: 0,
      periodStart,
      periodEnd,
    });
  }

  // Get or create the current period balance
  let [balance] = await db
    .select()
    .from(creditBalances)
    .where(
      and(
        eq(creditBalances.orgId, orgId),
        gte(creditBalances.periodStart, periodStart),
        lte(creditBalances.periodEnd, periodEnd),
      ),
    )
    .limit(1);

  if (!balance) {
    const [created] = await db
      .insert(creditBalances)
      .values({
        orgId,
        subscriptionId: subId,
        includedCredits: subIncludedCredits,
        purchasedCredits: 0,
        usedCredits: 0,
        periodStart,
        periodEnd,
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      balance = created;
    } else {
      // A concurrent request won the insert — read the row it created.
      [balance] = await db
        .select()
        .from(creditBalances)
        .where(and(eq(creditBalances.orgId, orgId), eq(creditBalances.periodStart, periodStart)))
        .limit(1);
    }
  }

  if (!balance) {
    throw new Error(`credits: no balance row could be created for org ${orgId}`);
  }

  const total = balance.includedCredits + balance.purchasedCredits;
  const reserved = balance.reservedCredits;
  // `available` is what can still be committed: work in flight has already
  // reserved its estimate, so a second reservation cannot double-book it.
  const available = Math.max(0, total - balance.usedCredits - reserved);
  const remaining = available;
  const daysRemaining = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  return {
    orgId,
    plan: subPlan,
    included: balance.includedCredits,
    purchased: balance.purchasedCredits,
    used: balance.usedCredits,
    reserved,
    remaining,
    available,
    total,
    utilizationPercent: total > 0 ? Math.round((balance.usedCredits / total) * 100) : 0,
    periodStart: balance.periodStart,
    periodEnd: balance.periodEnd,
    daysRemaining,
    isLow: remaining > 0 && remaining / total < 0.2,
    isCritical: remaining > 0 && remaining / total < 0.05,
  };
}

/**
 * Check if an organization has enough credits for an operation.
 */
export async function hasEnoughCredits(
  db: Db,
  orgId: string,
  operationType: string = 'default',
): Promise<{ allowed: boolean; balance: CreditBalanceInfo; required: number }> {
  const balance = await getOrCreateBalance(db, orgId);
  const required = (OPERATION_COSTS[operationType] ?? OPERATION_COSTS.default) as number;

  return {
    allowed: balance.remaining >= required,
    balance,
    required,
  };
}

/**
 * Consume credits for an operation.
 * Returns the updated balance. Throws CreditExhaustedError if insufficient.
 *
 * This is the core enforcement function — every credit-consuming operation
 * must call this.
 *
 * The price defaults to OPERATION_COSTS[operationType]. Callers that MEASURE
 * the work (the task executor bills the real tokens a run consumed) pass
 * `options.amount` so the ledger, the row that recorded the work and the audit
 * all carry one number instead of disagreeing.
 */
/**
 * Optional settlement metadata. `idempotencyKey` makes a retried settlement a
 * no-op; `attribution` records what the spend actually was (provider, model,
 * tokens, real provider cost) so internal margin reporting is possible.
 */
export interface CreditSettlementOptions {
  amount?: number;
  idempotencyKey?: string;
  attribution?: {
    provider?: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    providerCostUsd?: number;
    agentId?: string;
    taskId?: string;
    jobId?: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Consume credits for an operation (docs/77 P0).
 *
 * Correctness contract:
 *  - the debit is an **SQL increment**, never an absolute value computed from a
 *    prior read — two concurrent charges both land, so the balance always
 *    equals the sum of the ledger;
 *  - the ledger row is written first inside the same transaction, and the
 *    partial unique index on (org, idempotency_key) is the arbiter under a
 *    race, so a retry/replay returns "already applied" instead of charging
 *    twice;
 *  - the cap guard lives in the UPDATE's WHERE, so overspend is impossible even
 *    if the pre-read was stale.
 */
export async function consumeCredits(
  db: Db,
  orgId: string,
  operationType: string,
  description: string,
  referenceId?: string,
  referenceType?: string,
  options: CreditSettlementOptions = {},
): Promise<{ balance: CreditBalanceInfo; consumed: number; duplicate?: boolean }> {
  const balance = await getOrCreateBalance(db, orgId);
  const cost = options.amount !== undefined
    ? Math.max(0, Math.round(options.amount))
    : (OPERATION_COSTS[operationType] ?? OPERATION_COSTS.default) as number;

  // Nothing to charge (a run that produced no work): no transaction, no audit.
  if (cost === 0) return { balance, consumed: 0 };

  if (balance.remaining < cost) {
    throw new CreditExhaustedError(orgId, balance.remaining, cost, operationType);
  }

  const a = options.attribution ?? {};
  const settled = await db.transaction(async (tx) => {
    // 1. Ledger row first. With an idempotency key the unique index decides the
    //    race: zero rows returned means this exact charge was already applied.
    const inserted = await tx
      .insert(creditTransactions)
      .values({
        orgId,
        type: 'usage',
        amount: -cost,
        description,
        referenceId: referenceId ?? null,
        referenceType: referenceType ?? null,
        idempotencyKey: options.idempotencyKey ?? null,
        provider: a.provider ?? null,
        model: a.model ?? null,
        inputTokens: a.inputTokens ?? null,
        outputTokens: a.outputTokens ?? null,
        providerCostUsd: a.providerCostUsd !== undefined ? String(a.providerCostUsd) : null,
        agentId: a.agentId ?? null,
        taskId: a.taskId ?? (referenceType === 'task' ? referenceId ?? null : null),
        jobId: a.jobId ?? null,
        metadata: a.metadata ?? {},
      })
      .onConflictDoNothing()
      .returning({ id: creditTransactions.id });

    if (inserted.length === 0) return { duplicate: true as const };

    // 2. Atomic guarded debit — increment in SQL, cap check in the same WHERE.
    const updated = await tx
      .update(creditBalances)
      .set({
        usedCredits: sql`${creditBalances.usedCredits} + ${cost}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(creditBalances.orgId, orgId),
          gte(creditBalances.periodStart, balance.periodStart),
          // docs/80 Phase 1: reserved credits are already committed to in-flight
          // work, so a direct charge may not touch them — the cap spans
          // `used + reserved + cost <= total`.
          sql`${creditBalances.usedCredits} + ${creditBalances.reservedCredits} + ${cost} <= ${creditBalances.includedCredits} + ${creditBalances.purchasedCredits}`,
        ),
      )
      .returning({ id: creditBalances.id });

    if (updated.length === 0) {
      // Guard failed → the whole transaction (including the ledger row) rolls back.
      throw new CreditExhaustedError(orgId, 0, cost, operationType);
    }
    return { duplicate: false as const };
  });

  if (settled.duplicate) {
    // Already billed under this key: report honestly, charge nothing.
    return { balance: await getOrCreateBalance(db, orgId), consumed: 0, duplicate: true };
  }

  // Audit the consumption
  await appendAudit(db, {
    orgId,
    actorType: 'system',
    action: 'credits.consumed',
    outcome: 'success',
    cost: cost ?? 0,
  });

  // Return updated balance
  const updatedBalance = await getOrCreateBalance(db, orgId);

  // Check if we should fire a usage alert (non-blocking)
  try {
    const { checkAndAlert } = await import('./credit-alerts.js');
    await checkAndAlert(db, orgId, updatedBalance);
  } catch {
    // Alert check failure should not block credit consumption
  }

  return { balance: updatedBalance, consumed: cost };
}

/**
 * Add purchased credits to an organization's balance.
 */
/**
 * Credit purchased credits (docs/77 P0). Server-to-server only: the caller must
 * be a verified payment path (Stripe webhook) or an audited admin grant — see
 * the P0 note in the routes: the old self-serve top-up endpoint is gone.
 *
 * `idempotencyKey` is required in practice for payment paths (use the provider
 * event id), so a replayed webhook adds credits once.
 */
export async function addPurchasedCredits(
  db: Db,
  orgId: string,
  amount: number,
  description: string = 'Credit top-up',
  options: { idempotencyKey?: string; type?: string; metadata?: Record<string, unknown> } = {},
): Promise<{ balance: CreditBalanceInfo; applied: boolean }> {
  const balance = await getOrCreateBalance(db, orgId);
  const type = options.type ?? 'purchase';

  const applied = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(creditTransactions)
      .values({
        orgId,
        type,
        amount,
        description,
        idempotencyKey: options.idempotencyKey ?? null,
        metadata: options.metadata ?? {},
      })
      .onConflictDoNothing()
      .returning({ id: creditTransactions.id });
    if (inserted.length === 0) return false;

    // Increment in SQL — never an absolute value from a stale read.
    await tx
      .update(creditBalances)
      .set({
        purchasedCredits: sql`${creditBalances.purchasedCredits} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(creditBalances.orgId, orgId),
          gte(creditBalances.periodStart, balance.periodStart),
        ),
      );
    return true;
  });

  if (!applied) {
    // Replay: credits were already granted for this key.
    return { balance: await getOrCreateBalance(db, orgId), applied: false };
  }

  await appendAudit(db, {
    orgId,
    actorType: 'system',
    action: 'credits.purchased',
    outcome: 'success',
    cost: amount ?? 0,
  });

  return { balance: await getOrCreateBalance(db, orgId), applied: true };
}

/**
 * Adjust credits (admin operation — e.g., goodwill, correction).
 */
export async function adjustCredits(
  db: Db,
  orgId: string,
  amount: number,
  description: string,
  options: { idempotencyKey?: string; actorType?: 'user' | 'system' | 'agent'; actorId?: string } = {},
): Promise<{ balance: CreditBalanceInfo; applied: boolean }> {
  const balance = await getOrCreateBalance(db, orgId);

  const applied = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(creditTransactions)
      .values({
        orgId,
        type: 'adjustment',
        amount,
        description,
        idempotencyKey: options.idempotencyKey ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: creditTransactions.id });
    if (inserted.length === 0) return false;

    // Atomic, floored at zero — `greatest(0, ...)` keeps the aggregate honest
    // even when a negative adjustment exceeds what was purchased.
    await tx
      .update(creditBalances)
      .set({
        purchasedCredits: sql`greatest(0, ${creditBalances.purchasedCredits} + ${amount})`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(creditBalances.orgId, orgId),
          gte(creditBalances.periodStart, balance.periodStart),
        ),
      );
    return true;
  });

  // Adjustments were previously invisible in the audit trail (docs/77 §A13).
  if (applied) {
    await appendAudit(db, {
      orgId,
      actorType: options.actorType ?? 'system',
      actorId: options.actorId,
      action: 'credits.adjusted',
      outcome: 'success',
      cost: amount,
    });
  }

  return { balance: await getOrCreateBalance(db, orgId), applied };
}

/**
 * Reconcile the cached balance against the append-only ledger (docs/77 P0).
 * The ledger is the source of truth; `drift` is how far the aggregate has
 * wandered. Non-zero drift means a charge was lost or double-applied — the
 * condition that used to be invisible.
 */
export async function reconcileLedger(
  db: Db,
  orgId: string,
): Promise<{
  orgId: string;
  balanceUsed: number;
  ledgerUsed: number;
  drift: number;
  balanced: boolean;
  usageRows: number;
}> {
  const balance = await getOrCreateBalance(db, orgId);
  // Refunds move a settled charge back (a positive `refund` row), so they are
  // summed here too: `-amount` on a positive refund subtracts it, keeping
  // `drift = balance.used − ledger` at zero after a refund instead of leaving a
  // phantom positive drift.
  const [row] = await db
    .select({
      ledgerUsed: sql<number>`COALESCE(SUM(-${creditTransactions.amount}), 0)::int`,
      usageRows: sql<number>`count(*) FILTER (WHERE ${creditTransactions.type} = 'usage')::int`,
    })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.orgId, orgId),
        sql`${creditTransactions.type} IN ('usage', 'refund')`,
        gte(creditTransactions.createdAt, balance.periodStart),
        lte(creditTransactions.createdAt, balance.periodEnd),
      ),
    );
  const ledgerUsed = row?.ledgerUsed ?? 0;
  const drift = balance.used - ledgerUsed;
  return {
    orgId,
    balanceUsed: balance.used,
    ledgerUsed,
    drift,
    balanced: drift === 0,
    usageRows: row?.usageRows ?? 0,
  };
}

// ─── Transaction History ────────────────────────────────────────────────────

/**
 * Get credit transaction history for an organization.
 */
export async function getTransactionHistory(
  db: Db,
  orgId: string,
  limit: number = 50,
  offset: number = 0,
): Promise<CreditTransactionRecord[]> {
  return db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.orgId, orgId))
    .orderBy(desc(creditTransactions.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Get credit usage summary for the current period.
 */
export async function getUsageSummary(
  db: Db,
  orgId: string,
): Promise<CreditUsageSummary> {
  const balance = await getOrCreateBalance(db, orgId);

  // Get all usage transactions for this period
  const transactions = await db
    .select()
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.orgId, orgId),
        eq(creditTransactions.type, 'usage'),
        gte(creditTransactions.createdAt, balance.periodStart),
        lte(creditTransactions.createdAt, balance.periodEnd),
      ),
    )
    .orderBy(desc(creditTransactions.createdAt));

  // Aggregate by operation type
  const byOperationMap = new Map<string, { count: number; totalCost: number }>();
  for (const tx of transactions) {
    const key = tx.description?.split(':')[0] ?? 'unknown';
    const existing = byOperationMap.get(key) ?? { count: 0, totalCost: 0 };
    existing.count += 1;
    existing.totalCost += Math.abs(tx.amount);
    byOperationMap.set(key, existing);
  }

  const byOperation = Array.from(byOperationMap.entries()).map(([type, data]) => ({
    type,
    ...data,
  }));

  // Aggregate by day
  const dailyMap = new Map<string, number>();
  for (const tx of transactions) {
    const date = tx.createdAt.toISOString().split('T')[0] ?? 'unknown';
    dailyMap.set(date, (dailyMap.get(date) ?? 0) + Math.abs(tx.amount));
  }

  const dailyUsage = Array.from(dailyMap.entries())
    .map(([date, cost]) => ({ date, cost }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Spend per goal for this period, from the tasks that consumed it: a credit
  // transaction carries no goal, but its usage line names the task that ran
  // (`description: "task:<id>"`), and the task knows its goal.
  const goalTaskIds = new Set<string>();
  for (const tx of transactions) {
    const taskId = tx.description?.match(/^task:([0-9a-f-]{36})/i)?.[1];
    if (taskId) goalTaskIds.add(taskId);
  }
  const goalTasks = goalTaskIds.size
    ? await db
        .select({ id: tasks.id, goalId: tasks.goalId, title: tasks.title })
        .from(tasks)
        .where(sql`${tasks.id} IN ${[...goalTaskIds]}`)
    : [];
  const goalIdByTask = new Map(goalTasks.filter((t) => t.goalId).map((t) => [t.id, t]));
  const goalById = new Map<string, { id: string; title: string }>();
  for (const task of goalTasks) {
    if (task.goalId && !goalById.has(task.goalId)) {
      goalById.set(task.goalId, { id: task.goalId, title: task.title });
    }
  }

  const byGoalMap = new Map<string, { title: string; count: number; totalCost: number; taskCount: number }>();
  for (const tx of transactions) {
    const taskId = tx.description?.match(/^task:([0-9a-f-]{36})/i)?.[1];
    const task = taskId ? goalIdByTask.get(taskId) : undefined;
    const goalId = task?.goalId;
    if (!goalId) continue;
    const entry = byGoalMap.get(goalId) ?? {
      title: goalById.get(goalId)?.title ?? 'Untitled goal',
      count: 0,
      totalCost: 0,
      taskCount: 0,
    };
    entry.count += 1;
    entry.totalCost += Math.abs(tx.amount);
    if (taskId) entry.taskCount += 1;
    byGoalMap.set(goalId, entry);
  }
  const byGoal = Array.from(byGoalMap.entries())
    .map(([goalId, data]) => ({ goalId, ...data }))
    .sort((a, b) => b.totalCost - a.totalCost);

  // Spend per employee for this period. Most usage lines do not name an agent,
  // so fall back to the org's agents' own period spend (agents.cost is their
  // lifetime total); both are real records, and the page shows which is which.
  const byAgentMap = new Map<string, { agentName: string; totalCost: number }>();
  for (const tx of transactions) {
    const agentId = tx.referenceType === 'agent' ? tx.referenceId : null;
    if (!agentId) continue;
    byAgentMap.set(agentId, {
      agentName: byAgentMap.get(agentId)?.agentName ?? '',
      totalCost: (byAgentMap.get(agentId)?.totalCost ?? 0) + Math.abs(tx.amount),
    });
  }
  const agentIds = [...byAgentMap.keys()];
  if (agentIds.length > 0) {
    const named = await db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(sql`${agents.id} IN ${agentIds}`);
    for (const row of named) {
      const entry = byAgentMap.get(row.id);
      if (entry) entry.agentName = row.name;
    }
  }
  const byAgent = Array.from(byAgentMap.entries())
    .map(([agentId, data]) => ({ agentId, ...data }))
    .sort((a, b) => b.totalCost - a.totalCost);

  return {
    totalUsed: balance.used,
    byOperation,
    byGoal,
    byAgent,
    dailyUsage,
    period: { start: balance.periodStart, end: balance.periodEnd },
  };
}

// ─── Credit Reservations (docs/80 Phase 1) ───────────────────────────────────
//
// Reserve → execute → settle/release. A reservation is *state*, not a money
// movement: taking one writes no ledger row (that would double-count under
// expiry), it only moves credits from `available` into `reserved`. The money
// lands once, at settlement, as a `usage` row. This is what makes concurrent
// long-running work safe: two tasks cannot both spend the same last 10 credits,
// because each holds its estimate out of the balance before it starts.

/** Default hold lifetime when a caller does not pass one (30 minutes). */
export const DEFAULT_RESERVATION_TTL_MS = 30 * 60 * 1000;

export interface ReserveCreditsInput {
  /** Estimated credits this work will cost (the hold). */
  estimate: number;
  taskId?: string;
  jobId?: string;
  agentId?: string;
  reason?: string;
  /** Hold lifetime; defaults to `DEFAULT_RESERVATION_TTL_MS`. */
  ttlMs?: number;
  /** Absolute deadline, overriding `ttlMs`. */
  expiresAt?: Date;
  /**
   * Trial per-day ceiling (docs/80 §3.3): when the org is on the `trial` plan and
   * this is > 0, the reservation is refused once today's measured spend plus this
   * estimate would exceed the cap. Closes the trial-farm abuse scenario (#3).
   */
  dailyCap?: number;
  /**
   * docs/80 Phase 2: set when a founder has already approved spend above the
   * constitution's `requiresApprovalAbove` (the executor consumes the granted
   * approval and re-reserves). Hard ceilings and the kill switch still apply.
   */
  approved?: boolean;
}

export interface CreditReservationInfo {
  id: string;
  orgId: string;
  estimateCredits: number;
  settledCredits: number | null;
  status: string;
  reason: string | null;
  expiresAt: Date;
}

export interface ReservationOutcome {
  reservationId: string;
  /** Credits actually charged at settlement (0 for a release). */
  settled: number;
  /** Credits handed back to `available` (estimate − settled for a settle). */
  released: number;
  status: string;
  /** True when the reservation was already settled/released (a replay). */
  duplicate: boolean;
}

export interface SettleReservationOptions {
  /** Measured credits to charge. Capped at the reservation estimate (hard stop). */
  actualCredits: number;
  description?: string;
  referenceId?: string;
  referenceType?: string;
  idempotencyKey?: string;
  attribution?: CreditSettlementOptions['attribution'];
}

function toReservationInfo(row: CreditReservation): CreditReservationInfo {
  return {
    id: row.id,
    orgId: row.orgId,
    estimateCredits: row.estimateCredits,
    settledCredits: row.settledCredits,
    status: row.status,
    reason: row.reason,
    expiresAt: row.expiresAt,
  };
}

/**
 * Take a reservation against an org's balance.
 *
 * Throws `CreditExhaustedError` when `available` cannot cover the estimate. The
 * cap guard lives in the UPDATE's WHERE (`used + reserved + estimate <= total`),
 * so two concurrent reservations cannot over-commit even if both pre-reads were
 * stale.
 */
export async function reserveCredits(
  db: Db,
  orgId: string,
  input: ReserveCreditsInput,
): Promise<CreditReservationInfo> {
  const estimate = Math.max(0, Math.round(input.estimate));

  // docs/80 Phase 2: the constitution's budget policy is enforced here, at the
  // one place every spend path passes through. A hard ceiling or the org kill
  // switch refuses the work (nothing runs, nothing is charged); spend above the
  // approval threshold is refused until a founder's grant is presented.
  const budget = await evaluateBudget(db, { orgId, estimate, agentId: input.agentId });
  if (!budget.allowed) {
    throw new BudgetExceededError(orgId, budget.reason!, budget.detail, estimate);
  }
  if (budget.approvalRequired && !input.approved) {
    throw new BudgetApprovalRequiredError(orgId, estimate, budget.policy.requiresApprovalAbove, budget.detail);
  }

  const balance = await getOrCreateBalance(db, orgId);

  if (estimate > balance.available) {
    throw new CreditExhaustedError(orgId, balance.available, estimate, input.reason ?? 'reservation');
  }

  // Trial per-day ceiling: a trial org has no payment method, so a daily cap
  // bounds what one account can consume regardless of its starting allotment.
  if (input.dailyCap && input.dailyCap > 0 && balance.plan === 'trial') {
    const spentToday = await getDailyUsage(db, orgId);
    const remainingToday = Math.max(0, input.dailyCap - spentToday);
    if (estimate > remainingToday) {
      throw new CreditExhaustedError(orgId, remainingToday, estimate, 'trial.daily_cap');
    }
  }

  const expiresAt =
    input.expiresAt ?? new Date(Date.now() + (input.ttlMs ?? DEFAULT_RESERVATION_TTL_MS));

  const reservation = await db.transaction(async (tx) => {
    const updated = await tx
      .update(creditBalances)
      .set({
        reservedCredits: sql`${creditBalances.reservedCredits} + ${estimate}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(creditBalances.orgId, orgId),
          gte(creditBalances.periodStart, balance.periodStart),
          sql`${creditBalances.usedCredits} + ${creditBalances.reservedCredits} + ${estimate} <= ${creditBalances.includedCredits} + ${creditBalances.purchasedCredits}`,
        ),
      )
      .returning({ id: creditBalances.id });

    if (updated.length === 0) {
      throw new CreditExhaustedError(orgId, 0, estimate, input.reason ?? 'reservation');
    }

    const [row] = await tx
      .insert(creditReservations)
      .values({
        orgId,
        taskId: input.taskId ?? null,
        jobId: input.jobId ?? null,
        agentId: input.agentId ?? null,
        estimateCredits: estimate,
        status: 'active',
        reason: input.reason ?? null,
        expiresAt,
      })
      .returning();

    return row!;
  });

  return toReservationInfo(reservation);
}

/**
 * Settle a reservation: charge the measured actual and release the remainder.
 *
 * Hard stop (docs/80 §3.1): the settled amount can never exceed the estimate —
 * the excess is unbilled, not silently charged. Idempotent: a replay finds the
 * reservation no longer `active` and reports `duplicate` instead of charging
 * twice.
 */
export async function settleReservation(
  db: Db,
  reservationId: string,
  options: SettleReservationOptions,
): Promise<ReservationOutcome> {
  const [reservation] = await db
    .select()
    .from(creditReservations)
    .where(eq(creditReservations.id, reservationId))
    .limit(1);

  if (!reservation) {
    throw new Error(`credits: reservation ${reservationId} not found`);
  }

  if (reservation.status !== 'active') {
    // A replay charges nothing *here* — `settled` is what THIS call did. The
    // reservation's own settledCredits is on the row; `status` tells the caller
    // whether it was already settled (no action) or swept (released/expired).
    return {
      reservationId,
      settled: 0,
      released: 0,
      status: reservation.status,
      duplicate: true,
    };
  }

  const estimate = reservation.estimateCredits;
  const actual = Math.min(estimate, Math.max(0, Math.round(options.actualCredits)));
  const balance = await getOrCreateBalance(db, reservation.orgId);
  const a = options.attribution ?? {};

  const claimed = await db.transaction(async (tx) => {
    // Claim first: the status transition is the arbiter, so a second settle of
    // the same reservation releases nothing and charges nothing.
    const updatedReservation = await tx
      .update(creditReservations)
      .set({ status: 'settled', settledCredits: actual, updatedAt: new Date() })
      .where(and(eq(creditReservations.id, reservationId), eq(creditReservations.status, 'active')))
      .returning({ id: creditReservations.id });

    if (updatedReservation.length === 0) return false;

    if (actual > 0) {
      await tx
        .insert(creditTransactions)
        .values({
          orgId: reservation.orgId,
          type: 'usage',
          amount: -actual,
          description: options.description ?? 'Reserved work settlement',
          referenceId:
            options.referenceId ?? reservation.taskId ?? reservation.jobId ?? null,
          referenceType:
            options.referenceType ?? (reservation.taskId ? 'task' : reservation.jobId ? 'job' : null),
          idempotencyKey: options.idempotencyKey ?? null,
          provider: a.provider ?? null,
          model: a.model ?? null,
          inputTokens: a.inputTokens ?? null,
          outputTokens: a.outputTokens ?? null,
          providerCostUsd: a.providerCostUsd !== undefined ? String(a.providerCostUsd) : null,
          agentId: a.agentId ?? reservation.agentId ?? null,
          taskId: a.taskId ?? reservation.taskId ?? null,
          jobId: a.jobId ?? reservation.jobId ?? null,
          metadata: a.metadata ?? {},
        })
        .onConflictDoNothing();
    }

    await tx
      .update(creditBalances)
      .set({
        usedCredits: sql`${creditBalances.usedCredits} + ${actual}`,
        reservedCredits: sql`greatest(0, ${creditBalances.reservedCredits} - ${estimate})`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(creditBalances.orgId, reservation.orgId),
          gte(creditBalances.periodStart, balance.periodStart),
        ),
      );

    return true;
  });

  if (!claimed) {
    return { reservationId, settled: 0, released: 0, status: 'settled', duplicate: true };
  }

  if (actual > 0) {
    await appendAudit(db, {
      orgId: reservation.orgId,
      actorType: 'system',
      agentId: reservation.agentId ?? undefined,
      taskId: reservation.taskId ?? undefined,
      action: 'credits.consumed',
      outcome: 'success',
      cost: actual,
    }).catch(() => undefined);
  }

  return {
    reservationId,
    settled: actual,
    released: estimate - actual,
    status: 'settled',
    duplicate: false,
  };
}

/**
 * Release a reservation without charging (no work ran, or the work's spend was
 * already accounted for elsewhere). Idempotent.
 */
export async function releaseReservation(
  db: Db,
  reservationId: string,
  reason?: string,
): Promise<ReservationOutcome> {
  return finalizeRelease(db, reservationId, 'released', reason);
}

async function finalizeRelease(
  db: Db,
  reservationId: string,
  status: 'released' | 'expired',
  reason?: string,
): Promise<ReservationOutcome> {
  const [reservation] = await db
    .select()
    .from(creditReservations)
    .where(eq(creditReservations.id, reservationId))
    .limit(1);

  if (!reservation) {
    throw new Error(`credits: reservation ${reservationId} not found`);
  }

  if (reservation.status !== 'active') {
    return { reservationId, settled: 0, released: 0, status: reservation.status, duplicate: true };
  }

  const estimate = reservation.estimateCredits;
  const balance = await getOrCreateBalance(db, reservation.orgId);

  const claimed = await db.transaction(async (tx) => {
    const updatedReservation = await tx
      .update(creditReservations)
      .set({ status, reason: reason ?? reservation.reason, updatedAt: new Date() })
      .where(and(eq(creditReservations.id, reservationId), eq(creditReservations.status, 'active')))
      .returning({ id: creditReservations.id });

    if (updatedReservation.length === 0) return false;

    await tx
      .update(creditBalances)
      .set({
        reservedCredits: sql`greatest(0, ${creditBalances.reservedCredits} - ${estimate})`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(creditBalances.orgId, reservation.orgId),
          gte(creditBalances.periodStart, balance.periodStart),
        ),
      );

    // Traceability with no money movement: a zero-amount `reservation_release`
    // row records when the hold ended and why (the ledger vocabulary includes
    // it for exactly this). Reconcile ignores it; transaction history shows it.
    await tx
      .insert(creditTransactions)
      .values({
        orgId: reservation.orgId,
        type: 'reservation_release',
        amount: 0,
        description:
          status === 'expired' ? 'Reservation expired' : `Reservation released${reason ? `: ${reason}` : ''}`,
        referenceId: reservation.taskId ?? reservation.jobId ?? null,
        referenceType: reservation.taskId ? 'task' : reservation.jobId ? 'job' : null,
        idempotencyKey: `reservation_release:${reservationId}`,
        taskId: reservation.taskId ?? null,
        jobId: reservation.jobId ?? null,
        agentId: reservation.agentId ?? null,
        metadata: { estimateCredits: estimate },
      })
      .onConflictDoNothing();

    return true;
  });

  return {
    reservationId,
    settled: 0,
    released: claimed ? estimate : 0,
    status,
    duplicate: !claimed,
  };
}

/**
 * Stale sweep (docs/80 §3.1): release live reservations past their deadline so
 * a crashed worker, a timed-out job or an abandoned task returns its hold. Run
 * from the worker tick or a cron; safe to call repeatedly.
 */
export async function expireStaleReservations(
  db: Db,
  options: { now?: Date; limit?: number } = {},
): Promise<{ expired: number; releasedCredits: number }> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 100;

  const stale = await db
    .select({ id: creditReservations.id })
    .from(creditReservations)
    .where(and(eq(creditReservations.status, 'active'), lt(creditReservations.expiresAt, now)))
    .limit(limit);

  let expired = 0;
  let releasedCredits = 0;
  for (const row of stale) {
    const outcome = await finalizeRelease(db, row.id, 'expired', 'expired');
    if (!outcome.duplicate) {
      expired += 1;
      releasedCredits += outcome.released;
    }
  }

  return { expired, releasedCredits };
}

/**
 * Measured spend so far today (UTC), the basis for the trial per-day ceiling.
 * Counts `usage` rows only; refunds are not spend.
 */
export async function getDailyUsage(db: Db, orgId: string, now: Date = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [row] = await db
    .select({ spent: sql<number>`COALESCE(SUM(-${creditTransactions.amount}), 0)::int` })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.orgId, orgId),
        eq(creditTransactions.type, 'usage'),
        gte(creditTransactions.createdAt, start),
      ),
    );
  return row?.spent ?? 0;
}

/**
 * Refund a settled charge (docs/80 §3.1/§3.8). ORQ8-caused failure after a
 * charge returns the credits and reverses the usage in the reconcile sum, so
 * the ledger stays consistent. Idempotent on the caller's key.
 */
export async function refundCredits(
  db: Db,
  orgId: string,
  amount: number,
  options: {
    reason: string;
    idempotencyKey?: string;
    referenceId?: string;
    referenceType?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ balance: CreditBalanceInfo; refunded: number; duplicate?: boolean }> {
  const credits = Math.max(0, Math.round(amount));
  if (credits === 0) {
    return { balance: await getOrCreateBalance(db, orgId), refunded: 0 };
  }

  const balance = await getOrCreateBalance(db, orgId);

  const applied = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(creditTransactions)
      .values({
        orgId,
        type: 'refund',
        amount: credits,
        description: options.reason,
        referenceId: options.referenceId ?? null,
        referenceType: options.referenceType ?? null,
        idempotencyKey: options.idempotencyKey ?? null,
        metadata: options.metadata ?? {},
      })
      .onConflictDoNothing()
      .returning({ id: creditTransactions.id });

    if (inserted.length === 0) return false;

    // A refund returns spent credits: decrement `used`, floored at zero so a
    // refund larger than the period's spend cannot make the aggregate negative.
    await tx
      .update(creditBalances)
      .set({
        usedCredits: sql`greatest(0, ${creditBalances.usedCredits} - ${credits})`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(creditBalances.orgId, orgId),
          gte(creditBalances.periodStart, balance.periodStart),
        ),
      );

    return true;
  });

  if (!applied) {
    return { balance: await getOrCreateBalance(db, orgId), refunded: 0, duplicate: true };
  }

  await appendAudit(db, {
    orgId,
    actorType: 'system',
    action: 'credits.refunded',
    outcome: 'success',
    cost: credits,
    resultRef: options.reason.slice(0, 200),
  }).catch(() => undefined);

  return { balance: await getOrCreateBalance(db, orgId), refunded: credits };
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export class CreditExhaustedError extends Error {
  constructor(
    public readonly orgId: string,
    public readonly remaining: number,
    public readonly required: number,
    public readonly operationType: string,
  ) {
    super(
      `Work Credits exhausted: ${remaining} remaining, ${required} required for "${operationType}". ` +
      `Upgrade your plan or purchase additional credits.`,
    );
    this.name = 'CreditExhaustedError';
  }
}
