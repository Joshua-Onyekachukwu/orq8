/**
 * ORQ8 Goal Intelligence — drill-down surface
 *
 * Turns a goal from a passive progress number into an explainable operating
 * object: tasks, blockers, anomalies (reusing the anomaly detector) and a
 * deterministic recovery proposal derived from real signals.
 *
 * Nothing here executes consequential changes — proposals are advisory and
 * flagged when they would require founder approval to act on.
 */

import { eq, and } from 'drizzle-orm';
import type { Db } from '@orq8/db';
import { goals, tasks, agents } from '@orq8/db';
import { scanOrgAnomalies, isBlockedTask, type Anomaly } from './anomaly-detector.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type GoalHealth = 'no_activity' | 'on_track' | 'at_risk' | 'stalled' | 'blocked';

export interface GoalDrillDown {
  goal: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    progress: number;
    priority: string;
    dueDate: string | null;
    updatedAt: string;
    createdAt: string;
  };
  health: GoalHealth;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string | null;
    updatedAt: string;
    daysSinceUpdate: number;
    blocked: boolean;
    overdue: boolean;
    agent: { id: string; name: string; role: string } | null;
  }>;
  anomalies: Anomaly[];
  recoveryProposal: Array<{ action: string; reason: string; requiresApproval: boolean }>;
}

// ─── Pure helpers (unit-testable) ──────────────────────────────────────────

export function classifyGoalHealth(opts: {
  progress: number;
  dueDate: Date | null;
  updatedAt: Date;
  now: Date;
  taskCount: number;
  blockedCount: number;
  failedCount: number;
}): GoalHealth {
  const { progress, dueDate, updatedAt, now, taskCount, blockedCount, failedCount } = opts;
  if (taskCount === 0) return 'no_activity';
  if (blockedCount > 0 || failedCount > 0) return 'blocked';

  const daysSinceUpdate = (now.getTime() - updatedAt.getTime()) / (24 * 60 * 60 * 1000);
  if (daysSinceUpdate > 3) return 'stalled';

  if (dueDate) {
    const remainingMs = dueDate.getTime() - now.getTime();
    if (remainingMs >= 0 && remainingMs <= 72 * 60 * 60 * 1000 && progress < 60) return 'at_risk';
  }
  return 'on_track';
}

/**
 * Deterministic recovery proposal from real signals. Each item states the
 * action, why, and whether executing it would need founder approval.
 */
export function buildRecoveryProposal(input: {
  goalTitle: string;
  health: GoalHealth;
  blockedTasks: Array<{ title: string }>;
  overdueTasks: Array<{ title: string }>;
  failedTasks: Array<{ title: string }>;
  atRisk: boolean;
}): Array<{ action: string; reason: string; requiresApproval: boolean }> {
  const out: Array<{ action: string; reason: string; requiresApproval: boolean }> = [];

  if (input.health === 'no_activity') {
    out.push({
      action: 'Create initial tasks for this goal',
      reason: 'The goal has no supporting work — it cannot progress without tasks.',
      requiresApproval: false,
    });
  }

  if (input.atRisk || input.health === 'at_risk') {
    out.push({
      action: 'Raise priority and focus execution on remaining tasks',
      reason: `Deadline is within 72 hours and progress is under 60% for "${input.goalTitle}".`,
      requiresApproval: true,
    });
  }

  if (input.health === 'stalled') {
    out.push({
      action: 'Break the goal into smaller milestones or reprioritize it',
      reason: 'No progress update in over 3 days — the goal appears stalled.',
      requiresApproval: true,
    });
  }

  for (const t of input.blockedTasks) {
    out.push({
      action: `Investigate or reassign "${t.title}"`,
      reason: 'Task has had no update in over 2 days and is neither completed nor failed.',
      requiresApproval: true,
    });
  }

  for (const t of input.overdueTasks) {
    out.push({
      action: `Reschedule or reassign "${t.title}"`,
      reason: 'Task is past its due date and still open.',
      requiresApproval: true,
    });
  }

  for (const t of input.failedTasks) {
    out.push({
      action: `Diagnose and revise "${t.title}"`,
      reason: 'Task failed — review the failure before retrying.',
      requiresApproval: false,
    });
  }

  if (out.length === 0) {
    out.push({
      action: 'Continue current execution',
      reason: 'No blockers, failures or overdue work detected for this goal.',
      requiresApproval: false,
    });
  }

  return out;
}

// ─── DB drill-down ─────────────────────────────────────────────────────────

/** Full drill-down for one goal, org-scoped (404 on foreign/unknown goal). */
export async function getGoalDrillDown(
  db: Db,
  orgId: string,
  goalId: string,
  now = new Date(),
): Promise<GoalDrillDown | null> {
  const [goal] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.orgId, orgId)))
    .limit(1);
  if (!goal) return null;

  const goalTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      updatedAt: tasks.updatedAt,
      agentId: tasks.agentId,
    })
    .from(tasks)
    .where(and(eq(tasks.goalId, goalId), eq(tasks.orgId, orgId)));

  const agentIds = [...new Set(goalTasks.map((t) => t.agentId).filter((id): id is string => Boolean(id)))];
  const agentRows = agentIds.length
    ? await db.select({ id: agents.id, name: agents.name, role: agents.role }).from(agents).where(eq(agents.orgId, orgId))
    : [];
  const agentById = new Map(agentRows.map((a) => [a.id, a]));

  const openStatuses = new Set(['pending', 'in_progress', 'blocked']);
  const blockedTasks = goalTasks.filter((t) => openStatuses.has(t.status) && isBlockedTask(t.updatedAt, now));
  const overdueTasks = goalTasks.filter((t) => openStatuses.has(t.status) && t.dueDate && t.dueDate.getTime() < now.getTime());
  const failedTasks = goalTasks.filter((t) => t.status === 'failed');

  const health = classifyGoalHealth({
    progress: goal.progress,
    dueDate: goal.dueDate,
    updatedAt: goal.updatedAt,
    now,
    taskCount: goalTasks.length,
    blockedCount: blockedTasks.length,
    failedCount: failedTasks.length,
  });

  // Anomalies — reuse the org-level scan, filtered to this goal + its tasks.
  const scan = await scanOrgAnomalies(db, orgId, now);
  const taskIds = new Set(goalTasks.map((t) => t.id));
  const anomalies = scan.anomalies.filter((a) => a.refId === goalId || (a.refId !== null && taskIds.has(a.refId)));

  const recoveryProposal = buildRecoveryProposal({
    goalTitle: goal.title,
    health,
    blockedTasks,
    overdueTasks,
    failedTasks,
    atRisk: anomalies.some((a) => a.category === 'goal' && a.severity === 'warning'),
  });

  return {
    goal: {
      id: goal.id,
      title: goal.title,
      description: goal.description,
      status: goal.status,
      progress: goal.progress,
      priority: goal.priority,
      dueDate: goal.dueDate ? goal.dueDate.toISOString() : null,
      updatedAt: goal.updatedAt.toISOString(),
      createdAt: goal.createdAt.toISOString(),
    },
    health,
    tasks: goalTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      updatedAt: t.updatedAt.toISOString(),
      daysSinceUpdate: Math.max(0, Math.floor((now.getTime() - t.updatedAt.getTime()) / (24 * 60 * 60 * 1000))),
      blocked: blockedTasks.some((b) => b.id === t.id),
      overdue: overdueTasks.some((o) => o.id === t.id),
      agent: t.agentId && agentById.has(t.agentId) ? agentById.get(t.agentId) ?? null : null,
    })),
    anomalies,
    recoveryProposal,
  };
}