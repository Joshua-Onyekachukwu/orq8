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
import { eq, and, desc, sql } from 'drizzle-orm';
import { tasks, agents, activityEvents, companyMemory } from '@orq8/db';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AutonomyLevel = 'trusted' | 'watch' | 'restricted' | 'paused';

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

  // Autonomy
  autonomyLevel: AutonomyLevel;
  autonomyReason: string;
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

  const revisions = events.filter((e) => e.type.includes('revision')).length;
  const escalations = events.filter((e) => e.type.includes('escalat')).length;

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
    averageQAScore: 0, // Populated by QA system
    averageCostPerTask,
    totalCreditsUsed: totalCost,
    recentFailureCount: recentFailures,
    trend,
    autonomyLevel,
    autonomyReason,
  };
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
    autonomyLevel: 'watch',
    autonomyReason: 'No task history',
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
