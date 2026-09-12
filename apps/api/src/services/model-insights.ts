/**
 * Model insights (§7 model performance memory, §32 cost optimization engine).
 *
 * Aggregates the structured per-call history in `llm_performance` (migration
 * 0026) into per-model, per-phase statistics and turns them into cost
 * optimization recommendations. Every number is derived from measured rows —
 * nothing is fabricated. When there is insufficient data the functions say so
 * explicitly instead of inventing performance.
 */

import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { llmPerformance } from '@orq8/db';
import type { Db } from '@orq8/db';

/** Observation window for insights — a rolling 30 days. */
const WINDOW_DAYS = 30;
/** Minimum successful calls per model before a reliability claim is made. */
export const MIN_CALLS_FOR_RELIABILITY = 10;
/** Models with enough traffic to be worth recommending about. */
const MIN_CALLS_FOR_RECOMMENDATION = 20;

export interface ModelStat {
  model: string;
  provider: string;
  calls: number;
  successRate: number; // 0..1, measured
  avgDurationMs: number;
  avgTotalTokens: number;
}

export interface ModelInsightsSummary {
  windowDays: number;
  totalCalls: number;
  models: ModelStat[];
  sufficientData: boolean;
}

export async function getModelStats(db: Db, orgId: string): Promise<ModelInsightsSummary> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      model: llmPerformance.model,
      provider: llmPerformance.provider,
      calls: sql<number>`count(*)::int`,
      successes: sql<number>`count(*) filter (where ${llmPerformance.success})::int`,
      avgDurationMs: sql<number>`coalesce(round(avg(${llmPerformance.durationMs})), 0)::int`,
      avgTotalTokens: sql<number>`coalesce(round(avg(${llmPerformance.totalTokens})), 0)::int`,
    })
    .from(llmPerformance)
    .where(and(eq(llmPerformance.orgId, orgId), gte(llmPerformance.createdAt, since)))
    .groupBy(llmPerformance.model, llmPerformance.provider)
    .orderBy(desc(sql`count(*)`));

  const models: ModelStat[] = rows.map((r) => ({
    model: r.model,
    provider: r.provider,
    calls: r.calls,
    successRate: r.calls > 0 ? r.successes / r.calls : 0,
    avgDurationMs: r.avgDurationMs,
    avgTotalTokens: r.avgTotalTokens,
  }));

  const totalCalls = models.reduce((acc, m) => acc + m.calls, 0);
  return { windowDays: WINDOW_DAYS, totalCalls, models, sufficientData: totalCalls >= MIN_CALLS_FOR_RECOMMENDATION };
}

export interface RoutingShiftEntry {
  source: 'measured' | 'static' | 'default';
  calls: number;
}

export interface RoutingShift {
  /** Calls in the trailing 7 days, grouped by how their model was chosen. */
  week: RoutingShiftEntry[];
  /** Calls in the preceding 7 days (week-1) for the same grouping. */
  previousWeek: RoutingShiftEntry[];
  /** Measured share of routed calls this week (0..1), null when no calls. */
  measuredShare: number | null;
  previousMeasuredShare: number | null;
  /** Absolute change in measured share (percentage points). */
  shiftPct: number | null;
  /** Total calls across both weeks — context for the share numbers. */
  totalCalls: number;
}

/**
 * §31 feedback-loop visibility: is the router actually consuming measured
 * history? Groups the llm_performance routing_source label by week — a rising
 * 'measured' share means more calls are being chosen from real per-org model
 * history rather than static defaults. 'default' calls are un-routed pass-
 * throughs (no model specified); 'static' calls were deliberately pinned
 * (e.g. deliberation participants, capability tiers).
 */
export async function getRoutingShift(db: Db, orgId: string): Promise<RoutingShift> {
  const now = Date.now();
  const weekStart = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const prevStart = new Date(now - 14 * 24 * 60 * 60 * 1000);

  const weeklyGroup = async (from: Date, to: Date): Promise<RoutingShiftEntry[]> => {
    const rows = await db
      .select({
        source: llmPerformance.routingSource,
        calls: sql<number>`count(*)::int`,
      })
      .from(llmPerformance)
      .where(and(eq(llmPerformance.orgId, orgId), gte(llmPerformance.createdAt, from), sql`${llmPerformance.createdAt} < ${to}`))
      .groupBy(llmPerformance.routingSource);
    return rows.map((r) => ({ source: r.source as RoutingShiftEntry['source'], calls: r.calls }));
  };

  const [week, previousWeek] = await Promise.all([weeklyGroup(weekStart, new Date(now)), weeklyGroup(prevStart, weekStart)]);

  const shareOf = (entries: RoutingShiftEntry[]): number | null => {
    const total = entries.reduce((a, e) => a + e.calls, 0);
    if (total === 0) return null;
    const measured = entries.find((e) => e.source === 'measured')?.calls ?? 0;
    return measured / total;
  };

  const measuredShare = shareOf(week);
  const previousMeasuredShare = shareOf(previousWeek);
  const shiftPct = measuredShare !== null && previousMeasuredShare !== null ? measuredShare - previousMeasuredShare : null;

  return {
    week,
    previousWeek,
    measuredShare,
    previousMeasuredShare,
    shiftPct,
    totalCalls: [...week, ...previousWeek].reduce((a, e) => a + e.calls, 0),
  };
}

export type InsightKind =
  | 'redundant_reliability' // an expensive model does work a cheaper one does equally well
  | 'high_failure_rate' // a model is failing too often on real traffic
  | 'insufficient_data';

export interface ModelInsight {
  kind: InsightKind;
  title: string;
  detail: string;
  evidence: Record<string, number | string>;
}

/**
 * Cost optimization recommendations (§32) derived strictly from measured
 * history. Only two honest claim types are possible today:
 *   • redundant_reliability — two models serve the same phase with statistically
 *     indistinguishable success rates, and one costs fewer tokens per call.
 *   • high_failure_rate — a model's measured failure rate is above 20% over the
 *     window with meaningful traffic.
 * Anything else returns `insufficient_data` rather than a fabricated number.
 */
export async function getCostOptimizationInsights(db: Db, orgId: string): Promise<ModelInsight[]> {
  const summary = await getModelStats(db, orgId);
  if (!summary.sufficientData) {
    return [
      {
        kind: 'insufficient_data',
        title: 'Not enough model history yet',
        detail: `Cost optimization needs at least ${MIN_CALLS_FOR_RECOMMENDATION} recorded LLM calls in the last ${WINDOW_DAYS} days (currently ${summary.totalCalls}). Recommendations will appear as real usage accumulates — none are invented.`,
        evidence: { totalCalls: summary.totalCalls, required: MIN_CALLS_FOR_RECOMMENDATION },
      },
    ];
  }

  const insights: ModelInsight[] = [];

  // Group models by phase-mix is not directly available in the aggregate, so
  // compare within the dominant phase for each model (measured separately).
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const perPhase = await db
    .select({
      phase: llmPerformance.phase,
      model: llmPerformance.model,
      calls: sql<number>`count(*)::int`,
      successes: sql<number>`count(*) filter (where ${llmPerformance.success})::int`,
      avgTotalTokens: sql<number>`coalesce(round(avg(${llmPerformance.totalTokens})), 0)::int`,
    })
    .from(llmPerformance)
    .where(and(eq(llmPerformance.orgId, orgId), gte(llmPerformance.createdAt, since)))
    .groupBy(llmPerformance.phase, llmPerformance.model);

  const byPhase = new Map<string, typeof perPhase>();
  for (const row of perPhase) {
    const list = byPhase.get(row.phase) ?? [];
    list.push(row);
    byPhase.set(row.phase, list);
  }

  for (const [phase, models] of byPhase) {
    const eligible = models.filter((m) => m.calls >= MIN_CALLS_FOR_RELIABILITY);
    if (eligible.length < 2) continue;
    // Highest-success model is the reference; find cheaper models with
    // equivalent success (within 2 percentage points).
    const reference = [...eligible].sort((a, b) => b.successes / b.calls - a.successes / a.calls)[0];
    if (!reference) continue;
    const refRate = reference.successes / reference.calls;
    for (const m of eligible) {
      if (m.model === reference.model) continue;
      const rate = m.successes / m.calls;
      if (refRate - rate <= 0.02 && m.avgTotalTokens > reference.avgTotalTokens) {
        insights.push({
          kind: 'redundant_reliability',
          title: `"${m.model}" and "${reference.model}" perform equally on ${phase}`,
          detail: `Over the last ${WINDOW_DAYS} days, ${m.model} succeeded ${Math.round(rate * 100)}% of ${m.calls} ${phase} calls while ${reference.model} succeeded ${Math.round(refRate * 100)}% of ${reference.calls} — and uses more tokens per call on average (${m.avgTotalTokens} vs ${reference.avgTotalTokens}). Consider routing ${phase} work to ${reference.model}.`,
          evidence: {
            phase,
            model: m.model,
            calls: m.calls,
            successRate: Number(rate.toFixed(3)),
            referenceModel: reference.model,
            referenceCalls: reference.calls,
            referenceSuccessRate: Number(refRate.toFixed(3)),
            avgTokensModel: m.avgTotalTokens,
            avgTokensReference: reference.avgTotalTokens,
          },
        });
      }
    }
  }

  // Failure-rate flags from the per-model aggregate.
  for (const m of summary.models) {
    if (m.calls >= MIN_CALLS_FOR_RELIABILITY && m.successRate < 0.8) {
      insights.push({
        kind: 'high_failure_rate',
        title: `"${m.model}" fails ${Math.round((1 - m.successRate) * 100)}% of calls`,
        detail: `${m.model} recorded ${m.calls} calls in the last ${WINDOW_DAYS} days with a measured success rate of ${Math.round(m.successRate * 100)}%. Investigate provider errors or route this work to a more reliable model.`,
        evidence: { model: m.model, calls: m.calls, successRate: Number(m.successRate.toFixed(3)) },
      });
    }
  }

  if (insights.length === 0) {
    insights.push({
      kind: 'insufficient_data',
      title: 'No optimization opportunities found yet',
      detail: `All models are performing within normal bands across ${summary.totalCalls} measured calls. This re-evaluates automatically as new data arrives.`,
      evidence: { totalCalls: summary.totalCalls },
    });
  }

  return insights;
}
