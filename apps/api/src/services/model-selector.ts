/**
 * Measured-performance model selection (§7 model performance memory → §31
 * routing) — the feedback half of the router.
 *
 * `selectTierModel` picks the cheapest tier-sufficient model from the static
 * registry. This module overlays what the org has actually MEASURED in
 * `llm_performance` (migration 0026): if history shows the default pick is
 * degraded on real traffic while another tier-sufficient registry model is
 * performing, selection follows the evidence instead of the static ordering.
 *
 * Honesty rules:
 *   • Only models with real measured traffic can be promoted or penalized.
 *   • < MIN_CALLS_FOR_ROUTING_SUCCESS observed successes ⇒ no claim; static
 *     order stands. Small samples never flip routing.
 *   • Degradation requires >= MIN_CALLS_FOR_ROUTING_FAILURE observed failures.
 *   • Ties are broken by cost (cheaper wins) — never by recency or vibes.
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import { llmPerformance, organizations } from '@orq8/db';
import type { Db } from '@orq8/db';
import { modelsByTier, planTierCap, type ModelTier } from './model-intelligence.js';
import { calibrationRoutingAdvice, type CalibrationRoutingAdvice } from './calibration-routing.js';

/** Minimum successful calls before a model may be preferred over the default. */
export const MIN_CALLS_FOR_ROUTING_SUCCESS = 8;
/** Minimum observed failures before a model may be demoted as degraded. */
export const MIN_CALLS_FOR_ROUTING_FAILURE = 4;
/** Measured success rate at/above which a model is considered performing. */
export const SUCCESS_RATE_FLOOR = 0.9;
/** Measured success rate at/below which a model is considered degraded. */
export const SUCCESS_RATE_CEILING_DEGRADED = 0.7;
/** How much recent history feeds routing. */
export const ROUTING_WINDOW_DAYS = 14;

export interface ModelMeasuredStats {
  model: string;
  calls: number;
  successes: number;
  failures: number;
  successRate: number;
  avgDurationMs: number;
}

export interface RoutingPerformance {
  stats: Map<string, ModelMeasuredStats>;
  sufficientData: boolean;
}

/**
 * Measured per-model stats for one org over the routing window. Pure read.
 */
export async function getRoutingPerformance(db: Db, orgId: string): Promise<RoutingPerformance> {
  const since = new Date(Date.now() - ROUTING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      model: llmPerformance.model,
      calls: sql<number>`count(*)::int`,
      successes: sql<number>`count(*) filter (where ${llmPerformance.success})::int`,
      failures: sql<number>`count(*) filter (where not ${llmPerformance.success})::int`,
      avgDurationMs: sql<number>`coalesce(avg(${llmPerformance.durationMs}), 0)::int`,
    })
    .from(llmPerformance)
    .where(and(eq(llmPerformance.orgId, orgId), gte(llmPerformance.createdAt, since)))
    .groupBy(llmPerformance.model);

  const stats = new Map<string, ModelMeasuredStats>();
  for (const r of rows) {
    stats.set(r.model, {
      model: r.model,
      calls: r.calls,
      successes: r.successes,
      failures: r.failures,
      successRate: r.calls > 0 ? r.successes / r.calls : 0,
      avgDurationMs: r.avgDurationMs,
    });
  }
  const totalCalls = [...stats.values()].reduce((acc, s) => acc + s.calls, 0);
  return { stats, sufficientData: totalCalls >= MIN_CALLS_FOR_ROUTING_SUCCESS };
}

/** The org's plan, used to bound routing when a caller does not pass an explicit cap. */
async function getOrgPlan(db: Db, orgId: string): Promise<string> {
  const [row] = await db
    .select({ plan: organizations.plan })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return row?.plan ?? 'trial';
}

/**
 * Pick the execution model for a task: the cheapest tier-sufficient registry
 * model, unless measured history in this org says a sibling model in the same
 * tier is the reliable one. Deterministic given the same DB rows.
 *
 * docs/80 Phase 4: selection is bounded by the org's **plan tier cap**
 * (decision 5). The cap is a ceiling on quality: when a task's own risk/
 * complexity floor is higher than the plan allows, the cap wins, so a
 * low-revenue plan cannot burn a flagship model. The choice is always explained
 * in `reason`, and a cap-bound pick reports `source: 'plan_cap'`.
 */
export async function selectMeasuredModel(
  db: Db,
  orgId: string,
  routing: Parameters<typeof import('./model-intelligence.js').selectTierModel>[0],
  /** Calibration advice (§29→§31): when the org's measured confidence
   * calibration is inverted/weak, consequential routing is floored to the
   * strongest tier. Optional — callers without DB-decision access omit it. */
  calibration?: CalibrationRoutingAdvice | null,
  /** Optional explicit cap; otherwise the org's plan decides. */
  options?: { maxTier?: ModelTier },
): Promise<{ modelId: string | undefined; source: 'measured' | 'static' | 'plan_cap'; reason?: string }> {
  const tiers = modelsByTier();

  const plan = await getOrgPlan(db, orgId);
  const maxTier = options?.maxTier ?? planTierCap(plan);

  const requiredTier: ModelTier =
    routing.risk === 'critical' || routing.complexity >= 4 ? 2 : routing.complexity >= 3 || routing.reasoning !== 'low' ? 1 : 0;

  // Calibration consequence: a consequential (consequential-risk or complex)
  // task never routes below the advice's floor. Pure cost/complexity tasks
  // are untouched — the consequence targets decisions, not busywork.
  let floorTier: ModelTier = requiredTier;
  const consequential = routing.risk === 'critical' || routing.complexity >= 3;
  if (calibration?.active && consequential && calibration.minConsequentialTier !== null && floorTier < calibration.minConsequentialTier) {
    floorTier = calibration.minConsequentialTier;
  }

  // Plan cap wins over the quality floor (docs/80 decision 5): route down, never up.
  const cappedByPlan = floorTier > maxTier;
  const minTier = (cappedByPlan ? maxTier : floorTier) as ModelTier;
  const planDetail = cappedByPlan
    ? `Plan cap: the ${plan} plan allows model tier ${maxTier} at most, so a tier-${floorTier} task was clamped down`
    : undefined;

  // Static order of candidates (cheapest first), within the cap. When the cap
  // binds, the quality floor is relaxed, so every tier up to the cap is fair
  // game (a plan capped at tier 1 whose tier 1 has no registry model still gets
  // the cheapest tier-0 model rather than nothing).
  const candidates: string[] = [];
  for (let tier = cappedByPlan ? 0 : (minTier as number); tier <= maxTier; tier++) {
    for (const m of tiers[tier as ModelTier]) candidates.push(m.id);
  }
  const staticPick = candidates[0];

  const perf = await getRoutingPerformance(db, orgId);
  if (candidates.length <= 1) {
    return { modelId: staticPick, source: cappedByPlan ? 'plan_cap' : 'static', reason: planDetail };
  }
  if (perf.stats.size === 0) {
    return {
      modelId: staticPick,
      source: cappedByPlan ? 'plan_cap' : 'static',
      reason: cappedByPlan ? planDetail : 'insufficient measured history',
    };
  }

  // 1. Demote any candidate that is measured-degraded in this org. This path
  // is gated per-model (MIN_CALLS_FOR_ROUTING_FAILURE observed failures) —
  // NOT by overall volume, because an org whose default keeps failing is
  // exactly the one that needs the escape route.
  const degraded = new Set(
    candidates.filter((id) => {
      const s = perf.stats.get(id);
      return s !== undefined && s.failures >= MIN_CALLS_FOR_ROUTING_FAILURE && s.successRate <= SUCCESS_RATE_CEILING_DEGRADED;
    }),
  );

  // 2. Prefer the measured-performing candidate, honoring the static cost order.
  for (const id of candidates) {
    if (degraded.has(id)) continue;
    const s = perf.stats.get(id);
    if (
      s !== undefined &&
      s.successes >= MIN_CALLS_FOR_ROUTING_SUCCESS &&
      s.successRate >= SUCCESS_RATE_FLOOR
    ) {
      if (id === staticPick) {
        return { modelId: id, source: cappedByPlan ? 'plan_cap' : 'static', reason: planDetail };
      }
      return {
        modelId: id,
        source: 'measured',
        reason: `${id} has ${s.successes} measured successes at ${Math.round(s.successRate * 100)}% over ${ROUTING_WINDOW_DAYS}d — preferred over the static default${cappedByPlan ? ` (${planDetail})` : ''}`,
      };
    }
  }

  // 3. Nothing measured well enough: keep static order minus degraded picks.
  const firstHealthy = candidates.find((id) => !degraded.has(id));
  if (firstHealthy && firstHealthy !== staticPick) {
    return {
      modelId: firstHealthy,
      source: 'measured',
      reason: `static default is measured-degraded in this org (${[...degraded].join(', ')})${cappedByPlan ? ` (${planDetail})` : ''}`,
    };
  }

  return {
    modelId: staticPick,
    source: cappedByPlan ? 'plan_cap' : 'static',
    reason: planDetail ?? (degraded.size > 0 ? 'degraded candidate not present in registry candidates' : undefined),
  };
}
