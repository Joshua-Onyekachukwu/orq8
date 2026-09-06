/**
 * Simulation quality projections (Phase 8, §6-8).
 *
 * The workload/cost simulation is extended with MODELED quality outcomes built
 * from the organization's real historical performance:
 *
 *   completion_rate  — completed / total tasks
 *   approval_rate    — approved / decided approvals
 *   revision_rate    — revision activity events / executed tasks
 *   reliability_rate — (completed - failed) / completed
 *
 * Every modeled metric is clearly distinct from the LIVE baseline: the live
 * rate is the historical rate, the projected rate is a deterministic scenario
 * adjustment, and a Wilson score confidence interval communicates uncertainty.
 * When the historical sample is too small (< MIN_SAMPLE) the projection is
 * reported as unavailable rather than fabricated. Nothing in this module ever
 * writes to production state — projections are read-only estimates.
 */
import { and, eq, sql } from 'drizzle-orm';
import { tasks, approvals as approvalsTable, activityEvents, type Db } from '@orq8/db';

/** Minimum historical observations before a rate may be projected. */
export const MIN_SAMPLE = 10;

export type QualityMetric = 'completion_rate' | 'approval_rate' | 'revision_rate' | 'reliability_rate';

export interface QualityMetricProjection {
  metric: QualityMetric;
  label: string;
  liveRate: number | null;      // % (0-100) from real historical data
  sampleSize: number;
  projectedRate: number | null; // % modeled under the scenario
  lower: number | null;         // Wilson lower bound (%)
  upper: number | null;         // Wilson upper bound (%)
  confidenceLevel: 0.9;
  method: 'wilson' | null;
  available: boolean;           // false when the sample is too small
}

export interface HistoricalPerformance {
  completion: { rate: number | null; sampleSize: number };
  approval: { rate: number | null; sampleSize: number };
  revision: { rate: number | null; sampleSize: number };
  reliability: { rate: number | null; sampleSize: number };
}

export interface QualityScenario {
  currentAgents: number;
  proposedAgents: number;
  workloadChangePercent: number; // (proposedTasks - currentTasks) / currentTasks * 100
}

/** Aggregate the org's real historical quality rates. Org-scoped by construction. */
export async function aggregateHistoricalPerformance(db: Db, orgId: string): Promise<HistoricalPerformance> {
  const [taskRow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where status = 'completed')::int`,
      failed: sql<number>`count(*) filter (where status = 'failed')::int`,
      executed: sql<number>`count(*) filter (where status in ('completed', 'failed'))::int`,
    })
    .from(tasks)
    .where(eq(tasks.orgId, orgId));

  const [approvalRow] = await db
    .select({
      approved: sql<number>`count(*) filter (where status = 'approved')::int`,
      rejected: sql<number>`count(*) filter (where status = 'rejected')::int`,
      modified: sql<number>`count(*) filter (where status = 'modified')::int`,
    })
    .from(approvalsTable)
    .where(eq(approvalsTable.orgId, orgId));

  const [revisionRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(activityEvents)
    .where(and(eq(activityEvents.orgId, orgId), sql`type ilike '%revision%'`));

  const total = taskRow?.total ?? 0;
  const completed = taskRow?.completed ?? 0;
  const failed = taskRow?.failed ?? 0;
  const executed = taskRow?.executed ?? 0;
  const decided = (approvalRow?.approved ?? 0) + (approvalRow?.rejected ?? 0) + (approvalRow?.modified ?? 0);

  return {
    completion: { rate: total > 0 ? roundPct(completed / total) : null, sampleSize: total },
    approval: { rate: decided > 0 ? roundPct((approvalRow?.approved ?? 0) / decided) : null, sampleSize: decided },
    revision: { rate: executed > 0 ? roundPct((revisionRow?.c ?? 0) / executed) : null, sampleSize: executed },
    reliability: { rate: completed > 0 ? roundPct((completed - failed) / completed) : null, sampleSize: completed },
  };
}

function roundPct(x: number): number {
  return Math.round(x * 1000) / 10; // one decimal
}

/**
 * Wilson score interval for a proportion at 90% confidence (z ≈ 1.645).
 * Returns [lower, upper] as percentages, or null when n = 0.
 */
export function wilsonInterval(successes: number, n: number, z = 1.645): [number, number] | null {
  if (n <= 0) return null;
  const p = successes / n;
  const denom = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denom;
  const margin = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / denom;
  return [roundPct(Math.max(0, center - margin)), roundPct(Math.min(1, center + margin))];
}

/**
 * Deterministic scenario adjustment for a live rate. Direction is chosen so
 * tests can assert behavior: more agents → better completion/reliability;
 * heavier workload → worse completion/revision. Adjustments are modest and
 * capped so a scenario can never imply unrealistic outcomes.
 */
export function adjustRateForScenario(
  metric: QualityMetric,
  liveRate: number,
  scenario: QualityScenario,
): number {
  const agentDelta = scenario.proposedAgents - scenario.currentAgents;
  const wl = scenario.workloadChangePercent;

  let delta = 0;
  switch (metric) {
    case 'completion_rate':
      delta += Math.max(-10, Math.min(10, agentDelta * 2));
      delta -= Math.max(0, Math.min(15, wl * 0.05));
      break;
    case 'approval_rate':
      // Heavier workload adds pressure → slightly more scrutiny/rejections.
      delta -= Math.max(0, Math.min(8, wl * 0.03));
      delta += Math.max(0, Math.min(5, agentDelta * 1));
      break;
    case 'revision_rate':
      delta += Math.max(0, Math.min(10, wl * 0.02));
      delta -= Math.max(-4, Math.min(4, agentDelta * 0.8));
      break;
    case 'reliability_rate':
      delta += Math.max(-3, Math.min(3, agentDelta * 0.5));
      delta -= Math.max(0, Math.min(6, wl * 0.02));
      break;
  }
  return Math.round(Math.max(0, Math.min(100, liveRate + delta)));
}

/** Build the modeled quality projection for a scenario. Pure + deterministic. */
export function modelQualityProjection(
  historical: HistoricalPerformance,
  scenario: QualityScenario,
): QualityMetricProjection[] {
  const specs: Array<{
    metric: QualityMetric;
    label: string;
    rate: number | null;
    sampleSize: number;
  }> = [
    { metric: 'completion_rate', label: 'Completion rate', rate: historical.completion.rate, sampleSize: historical.completion.sampleSize },
    { metric: 'approval_rate', label: 'Approval rate', rate: historical.approval.rate, sampleSize: historical.approval.sampleSize },
    { metric: 'revision_rate', label: 'Revision rate', rate: historical.revision.rate, sampleSize: historical.revision.sampleSize },
    { metric: 'reliability_rate', label: 'Reliability rate', rate: historical.reliability.rate, sampleSize: historical.reliability.sampleSize },
  ];

  return specs.map((s) => {
    if (s.rate === null || s.sampleSize < MIN_SAMPLE) {
      return {
        metric: s.metric,
        label: s.label,
        liveRate: s.rate,
        sampleSize: s.sampleSize,
        projectedRate: null,
        lower: null,
        upper: null,
        confidenceLevel: 0.9 as const,
        method: null,
        available: false,
      };
    }
    const projectedRate = adjustRateForScenario(s.metric, s.rate, scenario);
    const successes = Math.round((s.rate / 100) * s.sampleSize);
    const [lower, upper] = wilsonInterval(successes, s.sampleSize) ?? [null, null];
    return {
      metric: s.metric,
      label: s.label,
      liveRate: s.rate,
      sampleSize: s.sampleSize,
      projectedRate,
      lower,
      upper,
      confidenceLevel: 0.9 as const,
      method: 'wilson',
      available: true,
    };
  });
}