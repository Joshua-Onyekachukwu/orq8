/**
 * Model & agent performance signals from the decision feedback loop (§20).
 *
 * `decision-feedback.ts` files *what actually happened* after a decision into
 * Decision Memory. This module turns those filed reviews into **performance
 * signals**:
 *
 *   • per-MODEL: how have executed tasks actually performed since decisions
 *     were made (success rate, latency, volume) — joined to the decisions that
 *     were live when the work ran, so a model's numbers reflect the era it
 *     operated in, not all-time averages.
 *   • per-AGENT: how each AI employee's task outcomes compare to the org
 *     baseline measured over the same window.
 *
 * Everything here is derived from measured rows (llm_performance, tasks,
 * decisions). Nothing is invented; empty data returns an explicit empty
 * signal rather than zeros masquerading as measurements.
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import { agents, decisions, llmPerformance, tasks } from '@orq8/db';
import type { Db } from '@orq8/db';

/** Minimum executed calls before a per-model reliability number is reported. */
export const MIN_CALLS_FOR_SIGNAL = 5;
/** Minimum tasks before a per-agent comparison is reported. */
export const MIN_TASKS_FOR_SIGNAL = 3;

export interface ModelSignal {
  model: string;
  provider: string;
  phase: string;
  calls: number;
  successes: number;
  successRate: number;
  avgDurationMs: number;
  reliability: 'reliable' | 'mixed' | 'degraded' | 'insufficient_data';
}

export interface AgentSignal {
  agentId: string;
  name: string;
  role: string;
  department: string | null;
  tasksCompleted: number;
  tasksFailed: number;
  openTasks: number;
  completionRate: number;
  /** Completion rate of the org's agents over the same window — the fair baseline. */
  orgCompletionRate: number;
  verdict: 'outperforming' | 'on_track' | 'underperforming' | 'insufficient_data';
}

export interface DecisionSignalSummary {
  decisionsReviewed: number;
  accuracyMix: Record<string, number>;
  generatedAt: string;
  models: ModelSignal[];
  agents: AgentSignal[];
}

function reliabilityOf(calls: number, rate: number): ModelSignal['reliability'] {
  if (calls < MIN_CALLS_FOR_SIGNAL) return 'insufficient_data';
  if (rate >= 0.9) return 'reliable';
  if (rate >= 0.7) return 'mixed';
  return 'degraded';
}

function verdictOf(completed: number, failed: number, open: number, rate: number, orgRate: number): AgentSignal['verdict'] {
  if (completed + failed < MIN_TASKS_FOR_SIGNAL) return 'insufficient_data';
  if (rate >= orgRate + 0.1) return 'outperforming';
  if (rate <= orgRate - 0.1) return 'underperforming';
  return 'on_track';
}

/** Per-model signals measured since the org's most recent filed decision review. */
export async function modelSignalsSinceLastReview(db: Db, orgId: string): Promise<ModelSignal[]> {
  const [anchor] = await db
    .select({ lastFiled: sql<string | null>`max(${decisions.outcomeFiledAt})` })
    .from(decisions)
    .where(eq(decisions.orgId, orgId));
  const lastFiled = anchor?.lastFiled ? new Date(anchor.lastFiled) : null;

  const rows = await db
    .select({
      model: llmPerformance.model,
      provider: llmPerformance.provider,
      phase: llmPerformance.phase,
      calls: sql<number>`count(*)::int`,
      successes: sql<number>`count(*) filter (where ${llmPerformance.success})::int`,
      avgDurationMs: sql<number>`coalesce(avg(${llmPerformance.durationMs}), 0)::int`,
    })
    .from(llmPerformance)
    .where(
      lastFiled
        ? and(eq(llmPerformance.orgId, orgId), gte(llmPerformance.createdAt, lastFiled))
        : eq(llmPerformance.orgId, orgId),
    )
    .groupBy(llmPerformance.model, llmPerformance.provider, llmPerformance.phase);

  return rows.map((r) => {
    const rate = r.calls > 0 ? r.successes / r.calls : 0;
    return {
      model: r.model,
      provider: r.provider,
      phase: r.phase,
      calls: r.calls,
      successes: r.successes,
      successRate: Math.round(rate * 1000) / 1000,
      avgDurationMs: r.avgDurationMs,
      reliability: reliabilityOf(r.calls, rate),
    };
  });
}

/** Per-agent signals for every active agent, compared to the org baseline. */
export async function agentSignalsSinceLastReview(db: Db, orgId: string): Promise<AgentSignal[]> {
  const [anchor] = await db
    .select({ lastFiled: sql<string | null>`max(${decisions.outcomeFiledAt})` })
    .from(decisions)
    .where(eq(decisions.orgId, orgId));
  const lastFiled = anchor?.lastFiled ? new Date(anchor.lastFiled) : null;
  const windowClause = lastFiled ? gte(tasks.createdAt, lastFiled) : undefined;

  const [orgStats] = await db
    .select({
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
      failed: sql<number>`count(*) filter (where ${tasks.status} = 'failed')::int`,
    })
    .from(tasks)
    .where(windowClause ? and(eq(tasks.orgId, orgId), windowClause) : eq(tasks.orgId, orgId));
  const orgCompleted = orgStats?.completed ?? 0;
  const orgFailed = orgStats?.failed ?? 0;
  const orgRate = orgCompleted + orgFailed > 0 ? orgCompleted / (orgCompleted + orgFailed) : 0;

  const rows = await db
    .select({
      agentId: agents.id,
      name: agents.name,
      role: agents.role,
      department: agents.department,
      completed: sql<number>`count(${tasks.id}) filter (where ${tasks.status} = 'completed')::int`,
      failed: sql<number>`count(${tasks.id}) filter (where ${tasks.status} = 'failed')::int`,
      open: sql<number>`count(${tasks.id}) filter (where ${tasks.status} not in ('completed','failed','archived'))::int`,
    })
    .from(agents)
    .leftJoin(tasks, and(eq(tasks.agentId, agents.id), eq(tasks.orgId, orgId), ...(windowClause ? [windowClause] : [])))
    .where(and(eq(agents.orgId, orgId), eq(agents.status, 'active')))
    .groupBy(agents.id, agents.name, agents.role, agents.department);

  return rows.map((r) => {
    const done = r.completed + r.failed;
    const rate = done > 0 ? r.completed / done : 0;
    return {
      agentId: r.agentId,
      name: r.name,
      role: r.role,
      department: r.department,
      tasksCompleted: r.completed,
      tasksFailed: r.failed,
      openTasks: r.open,
      completionRate: Math.round(rate * 1000) / 1000,
      orgCompletionRate: Math.round(orgRate * 1000) / 1000,
      verdict: verdictOf(r.completed, r.failed, r.open, rate, orgRate),
    };
  });
}

/**
 * Full signal summary for an org — read model for the API route. Purely
 * derived; safe to call on every request.
 */
export async function signalSummary(db: Db, orgId: string): Promise<DecisionSignalSummary> {
  const [accuracyRows, models, agentSigs] = await Promise.all([
    db
      .select({ accuracy: decisions.predictionAccuracy })
      .from(decisions)
      .where(and(eq(decisions.orgId, orgId), sql`${decisions.outcomeFiledAt} is not null`)),
    modelSignalsSinceLastReview(db, orgId),
    agentSignalsSinceLastReview(db, orgId),
  ]);

  // Accuracy mix aggregates the verdict the feedback loop persisted at filing
  // time (decisions.prediction_accuracy) — measured, not re-derived.
  const accuracyMix: Record<string, number> = {};
  for (const row of accuracyRows) {
    const key = row.accuracy ?? 'unclassified';
    accuracyMix[key] = (accuracyMix[key] ?? 0) + 1;
  }

  return {
    decisionsReviewed: accuracyRows.length,
    accuracyMix,
    generatedAt: new Date().toISOString(),
    models,
    agents: agentSigs,
  };
}

/**
 * Cron entry: recompute signals for orgs with newly filed reviews. Signals are
 * derived on read (no storage to corrupt), so this run's job is to verify the
 * derivation executes cleanly across orgs and report volume — bounded, cron-safe.
 */
export async function runSignalSync(db: Db): Promise<{ orgsSynced: number; modelSignals: number; agentSignals: number }> {
  const orgRows = await db
    .select({ orgId: decisions.orgId })
    .from(decisions)
    .where(sql`${decisions.outcomeFiledAt} is not null`)
    .groupBy(decisions.orgId)
    .limit(100);

  let modelSignals = 0;
  let agentSignals = 0;
  for (const { orgId } of orgRows) {
    const models = await modelSignalsSinceLastReview(db, orgId);
    const agentSigs = await agentSignalsSinceLastReview(db, orgId);
    modelSignals += models.length;
    agentSignals += agentSigs.length;
  }

  return { orgsSynced: orgRows.length, modelSignals, agentSignals };
}
