import { eq, and, desc, gte, lte } from 'drizzle-orm';
import {
  creditBalances,
  creditTransactions,
  subscriptions,
  type Db,
} from '@orq8/db';
import { appendAudit } from './audit.js';

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
  included: number;
  purchased: number;
  used: number;
  remaining: number;
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
        await db.insert(creditBalances).values({
          orgId,
          subscriptionId: subId,
          includedCredits: subIncludedCredits,
          purchasedCredits: 0,
          usedCredits: 0,
          periodStart,
          periodEnd,
        });

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
      .returning();

    balance = created!;
  }

  const total = balance.includedCredits + balance.purchasedCredits;
  const remaining = total - balance.usedCredits;
  const daysRemaining = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  return {
    orgId,
    included: balance.includedCredits,
    purchased: balance.purchasedCredits,
    used: balance.usedCredits,
    remaining,
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
 */
export async function consumeCredits(
  db: Db,
  orgId: string,
  operationType: string,
  description: string,
  referenceId?: string,
  referenceType?: string,
): Promise<{ balance: CreditBalanceInfo; consumed: number }> {
  const balance = await getOrCreateBalance(db, orgId);
  const cost = (OPERATION_COSTS[operationType] ?? OPERATION_COSTS.default) as number;

  if (balance.remaining < cost) {
    throw new CreditExhaustedError(orgId, balance.remaining, cost, operationType);
  }

  // Atomically update the balance
  await db
    .update(creditBalances)
    .set({
      usedCredits: balance.used + cost,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creditBalances.orgId, orgId),
        gte(creditBalances.periodStart, balance.periodStart),
      ),
    );

  // Record the transaction
  await db.insert(creditTransactions).values({
    orgId,
    type: 'usage',
    amount: -cost,
    description,
    referenceId: referenceId ?? null,
    referenceType: referenceType ?? null,
  });

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
export async function addPurchasedCredits(
  db: Db,
  orgId: string,
  amount: number,
  description: string = 'Credit top-up',
): Promise<CreditBalanceInfo> {
  const balance = await getOrCreateBalance(db, orgId);

  await db
    .update(creditBalances)
    .set({
      purchasedCredits: balance.purchased + amount,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creditBalances.orgId, orgId),
        gte(creditBalances.periodStart, balance.periodStart),
      ),
    );

  await db.insert(creditTransactions).values({
    orgId,
    type: 'purchase',
    amount: amount ?? 0,
    description,
  });

  await appendAudit(db, {
    orgId,
    actorType: 'system',
    action: 'credits.purchased',
    outcome: 'success',
    cost: amount ?? 0,
  });

  return getOrCreateBalance(db, orgId);
}

/**
 * Adjust credits (admin operation — e.g., goodwill, correction).
 */
export async function adjustCredits(
  db: Db,
  orgId: string,
  amount: number,
  description: string,
): Promise<CreditBalanceInfo> {
  const balance = await getOrCreateBalance(db, orgId);
  const newPurchased = Math.max(0, balance.purchased + amount);

  await db
    .update(creditBalances)
    .set({
      purchasedCredits: newPurchased,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creditBalances.orgId, orgId),
        gte(creditBalances.periodStart, balance.periodStart),
      ),
    );

  await db.insert(creditTransactions).values({
    orgId,
    type: 'adjustment',
    amount,
    description,
  });

  return getOrCreateBalance(db, orgId);
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

  return {
    totalUsed: balance.used,
    byOperation,
    byAgent: [],
    dailyUsage,
    period: { start: balance.periodStart, end: balance.periodEnd },
  };
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
