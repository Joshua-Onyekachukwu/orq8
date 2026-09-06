/**
 * ORQ8 Agent Reliability Scoring — Operational Trust Profile for AI Employees
 *
 * Tracks meaningful reliability metrics per agent:
 * - Task completion rate
 * - First-pass QA success rate
 * - Revision rate
 * - Failure rate
 * - Escalation rate
 * - Average quality score
 * - Cost efficiency
 *
 * Determines autonomy level: trusted → watch → restricted → paused
 */

import type { Db } from '@orq8/db';
import { eq, and, desc, ilike } from 'drizzle-orm';
import { tasks, agents, activityEvents, companyMemory } from '@orq8/db';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AutonomyLevel = 'trusted' | 'watch' | 'restricted' | 'paused';

export interface PerformanceHistoryWindow {
  /** Trailing window in days (7, 30 or 90). */
  windowDays: 7 | 30 | 90;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  revisionTasks: number;
  completionRate: number;
  failureRate: number;
  revisionRate: number;
  averageCostPerTask: number;
  /** True when this window has no activity — UI should say so, never guess. */
  noData: boolean;
}

export interface ReliabilityProfile {
  agentId: string;
  agentName: string;
  role: string;

  // Core metrics
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  revisionTasks: number;
  escalatedTasks: number;

  // Rates (0-100)
  completionRate: number;
  firstPassSuccessRate: number;
  revisionRate: number;
  failureRate: number;
  escalationRate: number;

  // Quality
  averageQAScore: number;
  averageCostPerTask: number;
  totalCreditsUsed: number;

  // Trend
  recentFailureCount: number; // last 10 tasks
  trend: 'improving' | 'stable' | 'declining';

  // Time-window history (7/30/90 days) for performance-over-time views
  history: PerformanceHistoryWindow[];

  // Autonomy
  autonomyLevel: AutonomyLevel;
  autonomyReason: string;

  // Founder-facing recommendation (derived from real metrics)
  recommendation: 'KEEP' | 'MONITOR' | 'IMPROVE' | 'RETRAIN / ADJUST' | 'REPLACE / ESCALATE';
  recommendationReason: string;
}

// ─── Profile Calculation ────────────────────────────────────────────────────

/**
 * Calculate the reliability profile for an agent.
 */
export async function calculateReliabilityProfile(
  db: Db,
  orgId: string,
  agentId: string,
): Promise<ReliabilityProfile> {
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.orgId, orgId)));

  if (!agent) {
    return createEmptyProfile(agentId, 'Unknown', 'unknown');
  }

  // Get all tasks for this agent
  const agentTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.agentId, agentId), eq(tasks.orgId, orgId)));

  const total = agentTasks.length;
  const completed = agentTasks.filter((t) => t.status === 'completed').length;
  const failed = agentTasks.filter((t) => t.status === 'failed').length;
  const totalCost = agentTasks.reduce((sum, t) => sum + (t.cost || 0), 0);

  // Get activity events for this agent (for revision/escalation counting)
  const events = await db
    .select()
    .from(activityEvents)
    .where(and(eq(activityEvents.agentId, agentId), eq(activityEvents.orgId, orgId)))
    .orderBy(desc(activityEvents.occurredAt));

  const history = buildHistoryWindows(agentTasks, events, Date.now());

  const revisions = events.filter((e) => e.type.includes('revision')).length;
  const escalations = events.filter((e) => e.type.includes('escalat')).length;
  const qaEntries = await db
    .select({ content: companyMemory.content })
    .from(companyMemory)
    .where(and(eq(companyMemory.orgId, orgId), eq(companyMemory.agentId, agentId), ilike(companyMemory.content, '%QA score:%')));
  const qaScores: number[] = [];
  for (const e of qaEntries) {
    const matches = e.content.matchAll(/QA score:\s*(\d+)/g);
    for (const m of matches) qaScores.push(Number(m[1]));
  }
  const averageQAScore = qaScores.length > 0 ? Math.round(qaScores.reduce((a, b) => a + b, 0) / qaScores.length) : 0;

  // Calculate rates
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const firstPassSuccessRate = total > 0 ? Math.round(((completed - revisions) / total) * 100) : 0;
  const revisionRate = total > 0 ? Math.round((revisions / total) * 100) : 0;
  const failureRate = total > 0 ? Math.round((failed / total) * 100) : 0;
  const escalationRate = total > 0 ? Math.round((escalations / total) * 100) : 0;
  const averageCostPerTask = total > 0 ? Math.round(totalCost / total) : 0;

  // Recent trend (last 10 tasks)
  const recentTasks = agentTasks.slice(0, 10);
  const recentFailures = recentTasks.filter((t) => t.status === 'failed').length;
  const olderTasks = agentTasks.slice(10);
  const olderFailures = olderTasks.filter((t) => t.status === 'failed').length;
  const recentRate = recentTasks.length > 0 ? recentFailures / recentTasks.length : 0;
  const olderRate = olderTasks.length > 0 ? olderFailures / olderTasks.length : 0;

  let trend: ReliabilityProfile['trend'] = 'stable';
  if (recentRate < olderRate - 0.1) trend = 'improving';
  else if (recentRate > olderRate + 0.1) trend = 'declining';

  // Determine autonomy level
  const { level: autonomyLevel, reason: autonomyReason } = determineAutonomy(
    completionRate,
    failureRate,
    escalationRate,
    recentFailures,
    total,
  );

  const { recommendation, recommendationReason } = recommendFromProfile({
    total,
    completionRate,
    failureRate,
    revisionRate,
    escalationRate,
    averageQAScore,
    averageCostPerTask,
    trend,
    autonomyLevel,
  });

  return {
    agentId,
    agentName: agent.name,
    role: agent.role,
    totalTasks: total,
    completedTasks: completed,
    failedTasks: failed,
    revisionTasks: revisions,
    escalatedTasks: escalations,
    completionRate,
    firstPassSuccessRate,
    revisionRate,
    failureRate,
    escalationRate,
    averageQAScore,
    averageCostPerTask,
    totalCreditsUsed: totalCost,
    recentFailureCount: recentFailures,
    trend,
    history,
    autonomyLevel,
    autonomyReason,
    recommendation,
    recommendationReason,
  };
}

// ─── Time-window history (pure, testable) ───────────────────────────────────

/**
 * Bucket tasks + revision events into trailing 7/30/90-day windows. Pure
 * function over already-loaded rows so the window math is unit-testable
 * without a database. A window with zero tasks AND zero events is marked
 * `noData` — callers must say "no data" rather than presenting a zero as a
 * real score.
 */
export function buildHistoryWindows(
  agentTasks: Array<{ createdAt: Date; status: string; cost: number | null }>,
  events: Array<{ occurredAt: Date; type: string }>,
  now = Date.now(),
): PerformanceHistoryWindow[] {
  return [7, 30, 90].map((days) => {
    const start = new Date(now - days * 24 * 60 * 60 * 1000);
    const windowTasks = agentTasks.filter((t) => t.createdAt.getTime() >= start.getTime());
    const wCompleted = windowTasks.filter((t) => t.status === 'completed').length;
    const wFailed = windowTasks.filter((t) => t.status === 'failed').length;
    const wCost = windowTasks.reduce((sum, t) => sum + (t.cost || 0), 0);
    const wEvents = events.filter((e) => e.occurredAt.getTime() >= start.getTime());
    const wRevisions = wEvents.filter((e) => e.type.includes('revision')).length;
    const wTotal = windowTasks.length;
    return {
      windowDays: days as PerformanceHistoryWindow['windowDays'],
      totalTasks: wTotal,
      completedTasks: wCompleted,
      failedTasks: wFailed,
      revisionTasks: wRevisions,
      completionRate: wTotal > 0 ? Math.round((wCompleted / wTotal) * 100) : 0,
      failureRate: wTotal > 0 ? Math.round((wFailed / wTotal) * 100) : 0,
      revisionRate: wTotal > 0 ? Math.round((wRevisions / wTotal) * 100) : 0,
      averageCostPerTask: wTotal > 0 ? Math.round(wCost / wTotal) : 0,
      noData: wTotal === 0 && wEvents.length === 0,
    };
  });
}

// ─── Autonomy Determination ─────────────────────────────────────────────────

function determineAutonomy(
  completionRate: number,
  failureRate: number,
  escalationRate: number,
  recentFailures: number,
  totalTasks: number,
): { level: AutonomyLevel; reason: string } {
  // Not enough data — default to watch
  if (totalTasks < 3) {
    return { level: 'watch', reason: 'Insufficient task history for assessment' };
  }

  // Paused: repeated recent failures
  if (recentFailures >= 3) {
    return { level: 'paused', reason: `${recentFailures} recent failures — requires founder intervention` };
  }

  // Restricted: high failure or escalation rate
  if (failureRate > 30 || escalationRate > 20) {
    return { level: 'restricted', reason: `High failure rate (${failureRate}%) or escalation rate (${escalationRate}%)` };
  }

  // Watch: moderate issues
  if (failureRate > 15 || escalationRate > 10 || recentFailures >= 2) {
    return { level: 'watch', reason: `Elevated failure rate (${failureRate}%) or recent failures` };
  }

  // Trusted: good performance
  return { level: 'trusted', reason: `Strong completion rate (${completionRate}%) with low failure rate` };
}

// ─── Recommendation ─────────────────────────────────────────────────────────

export type PerformanceRecommendation = ReliabilityProfile['recommendation'];

/**
 * Founder-facing recommendation derived from REAL metrics — never hard-coded
 * per agent. Priority order mirrors the brief: repeated failures dominate,
 * then quality/revision, then cost, then volume.
 */
export function recommendFromProfile(input: {
  total: number;
  completionRate: number;
  failureRate: number;
  revisionRate: number;
  escalationRate: number;
  averageQAScore: number;
  averageCostPerTask: number;
  trend: ReliabilityProfile['trend'];
  autonomyLevel: AutonomyLevel;
}): { recommendation: ReliabilityProfile['recommendation']; recommendationReason: string } {
  const { total, completionRate, failureRate, revisionRate, escalationRate, averageQAScore, averageCostPerTask, trend, autonomyLevel } = input;

  if (total < 3) {
    return { recommendation: 'MONITOR', recommendationReason: 'Insufficient task history (fewer than 3 tasks) — monitoring until there is enough evidence.' };
  }
  if (autonomyLevel === 'paused') {
    return { recommendation: 'REPLACE / ESCALATE', recommendationReason: `${total >= 3 ? 'Repeated recent failures' : 'Escalated failures'} — agent has been paused and needs founder intervention.` };
  }
  if (failureRate >= 50) {
    return { recommendation: 'REPLACE / ESCALATE', recommendationReason: `Failure rate is ${failureRate}% — the agent fails most work and should be replaced or escalated.` };
  }
  if (failureRate > 30 || escalationRate > 20) {
    return { recommendation: 'IMPROVE', recommendationReason: `Failure rate ${failureRate}% / escalation rate ${escalationRate}% — reliability is the blocker; improve context, tools or permissions before scaling work.` };
  }
  if (revisionRate >= 30) {
    return { recommendation: 'IMPROVE', recommendationReason: `Revision rate is ${revisionRate}% — output misses the mark on first pass; tighten requirements and QA criteria.` };
  }
  if (averageQAScore > 0 && averageQAScore < 70) {
    return { recommendation: 'IMPROVE', recommendationReason: `Average QA score is ${averageQAScore}/100 — quality is below the acceptable bar.` };
  }
  if (completionRate < 50 && total >= 3) {
    return { recommendation: 'RETRAIN / ADJUST', recommendationReason: `Completion rate is only ${completionRate}% — reconsider the agent's role, capabilities or configuration.` };
  }
  if (averageCostPerTask > 0 && averageCostPerTask > 500 && (completionRate < 80 || averageQAScore < 80)) {
    return { recommendation: 'RETRAIN / ADJUST', recommendationReason: `High cost per task (${averageCostPerTask} credits) combined with weak output — investigate model/tool choices.` };
  }
  if (trend === 'declining') {
    return { recommendation: 'MONITOR', recommendationReason: 'Performance is trending downward — watch closely before expanding this agent\'s workload.' };
  }
  return { recommendation: 'KEEP', recommendationReason: 'Consistently strong completion rate with low failure and revision rates.' };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function createEmptyProfile(agentId: string, name: string, role: string): ReliabilityProfile {
  return {
    agentId,
    agentName: name,
    role,
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    revisionTasks: 0,
    escalatedTasks: 0,
    completionRate: 0,
    firstPassSuccessRate: 0,
    revisionRate: 0,
    failureRate: 0,
    escalationRate: 0,
    averageQAScore: 0,
    averageCostPerTask: 0,
    totalCreditsUsed: 0,
    recentFailureCount: 0,
    trend: 'stable',
    history: [7, 30, 90].map((days) => ({
      windowDays: days as PerformanceHistoryWindow['windowDays'],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      revisionTasks: 0,
      completionRate: 0,
      failureRate: 0,
      revisionRate: 0,
      averageCostPerTask: 0,
      noData: true,
    })),
    autonomyLevel: 'watch',
    autonomyReason: 'No task history',
    recommendation: 'MONITOR',
    recommendationReason: 'No task history yet — monitoring until there is enough evidence.',
  };
}

/**
 * Get reliability profiles for all agents in an org.
 */
export async function getOrgReliabilityProfiles(
  db: Db,
  orgId: string,
): Promise<ReliabilityProfile[]> {
  const orgAgents = await db
    .select()
    .from(agents)
    .where(eq(agents.orgId, orgId));

  const profiles = await Promise.all(
    orgAgents.map((a) => calculateReliabilityProfile(db, orgId, a.id)),
  );

  return profiles.sort((a, b) => b.completionRate - a.completionRate);
}
