/**
 * ORQ8 Anomaly Detector (proactive intelligence — roadmap F7).
 *
 * Scans an org's real operational tables on demand and returns deterministic,
 * threshold-driven anomalies: stalled goals, at-risk goals, aging/blocked
 * tasks, task-failure spikes, and credit-spend spikes. Every signal is derived
 * from data the org already wrote (goals/tasks/creditTransactions) — nothing is
 * fabricated or modeled.
 *
 * The result feeds two consumers:
 *   - the daily briefing's "Needs Attention" section (proactive alerts)
 *   - GET /v1/analytics/anomalies (founder-facing view)
 *
 * Pure helpers are exported for unit tests; thresholds are constants so the
 * tuning surface is explicit.
 */

import { and, asc, count, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { goals, tasks, creditTransactions, type Db } from '@orq8/db';

export const STALL_DAYS = 3; // active goal with no progress update → stalled
export const AT_RISK_HOURS = 72; // goal due within this window with low progress → at risk
export const AT_RISK_PROGRESS = 60; // below this progress percentage → at risk
export const BLOCKED_DAYS = 2; // task neither done nor failed nor cancelled for this long
export const FAILURE_MIN = 3; // failures needed before a spike is considered
export const FAILURE_MULTIPLIER = 2;
export const SPEND_MIN = 50; // floor (credits) below which a spend spike is ignored
export const SPEND_MULTIPLIER = 2;

export interface Anomaly {
  severity: 'info' | 'warning' | 'critical';
  category: 'goal' | 'task' | 'failure' | 'spend';
  message: string;
  refId: string | null;
  detectedAt: string;
}

export interface AnomalyScan {
  orgId: string;
  scannedAt: string;
  anomalies: Anomaly[];
}

// ─── Pure helpers (unit-testable) ──────────────────────────────────────────

export function isStalledGoal(updatedAt: Date, now: Date, days = STALL_DAYS): boolean {
  return now.getTime() - updatedAt.getTime() > days * 24 * 60 * 60 * 1000;
}

export function isAtRiskGoal(
  dueDate: Date | null,
  progress: number,
  now: Date,
  hours = AT_RISK_HOURS,
  progressFloor = AT_RISK_PROGRESS,
): boolean {
  if (!dueDate) return false;
  const remainingMs = dueDate.getTime() - now.getTime();
  return remainingMs >= 0 && remainingMs <= hours * 60 * 60 * 1000 && progress < progressFloor;
}

export function isBlockedTask(updatedAt: Date, now: Date, days = BLOCKED_DAYS): boolean {
  return now.getTime() - updatedAt.getTime() > days * 24 * 60 * 60 * 1000;
}

export function isFailureSpike(current: number, previous: number): boolean {
  return current >= FAILURE_MIN && current >= previous * FAILURE_MULTIPLIER;
}

export function isSpendSpike(current: number, previous: number): boolean {
  if (current < SPEND_MIN) return false;
  if (previous === 0) return current >= SPEND_MIN * 2;
  return current >= previous * SPEND_MULTIPLIER;
}

// ─── DB scan ───────────────────────────────────────────────────────────────

/**
 * Scan an org for anomalies right now. Bounded queries only — the largest
 * scans are the org's active goals and incomplete tasks, which are already
 * indexes-backed (org_id + status). Spend compares two trailing windows.
 */
export async function scanOrgAnomalies(db: Db, orgId: string, now = new Date()): Promise<AnomalyScan> {
  const anomalies: Anomaly[] = [];

  // 1. Goals — stalled or at risk
  const activeGoals = await db
    .select({ id: goals.id, title: goals.title, status: goals.status, progress: goals.progress, dueDate: goals.dueDate, updatedAt: goals.updatedAt })
    .from(goals)
    .where(and(eq(goals.orgId, orgId), eq(goals.status, 'active')))
    .limit(100);

  for (const goal of activeGoals) {
    if (isStalledGoal(goal.updatedAt, now)) {
      const stalledDays = Math.floor((now.getTime() - goal.updatedAt.getTime()) / (24 * 60 * 60 * 1000));
      anomalies.push({
        severity: 'warning',
        category: 'goal',
        message: `Goal "${goal.title}" has had no progress for ${stalledDays}d — stalled.`,
        refId: goal.id,
        detectedAt: now.toISOString(),
      });
    }
    if (isAtRiskGoal(goal.dueDate, goal.progress, now)) {
      const hoursLeft = Math.max(1, Math.ceil((goal.dueDate!.getTime() - now.getTime()) / (60 * 60 * 1000)));
      anomalies.push({
        severity: 'critical',
        category: 'goal',
        message: `Goal "${goal.title}" is due in ~${hoursLeft}h at ${goal.progress}% progress — at risk.`,
        refId: goal.id,
        detectedAt: now.toISOString(),
      });
    }
  }

  // 2. Tasks — incomplete and untouched for too long (blocked/aging)
  const blockedTasks = await db
    .select({ id: tasks.id, title: tasks.title, status: tasks.status, updatedAt: tasks.updatedAt })
    .from(tasks)
    .where(
      and(
        eq(tasks.orgId, orgId),
        sql`${tasks.status} NOT IN ('completed', 'failed', 'cancelled')`,
      ),
    )
    .limit(200);
  for (const task of blockedTasks) {
    if (isBlockedTask(task.updatedAt, now)) {
      const days = Math.floor((now.getTime() - task.updatedAt.getTime()) / (24 * 60 * 60 * 1000));
      anomalies.push({
        severity: 'warning',
        category: 'task',
        message: `Task "${task.title}" has been ${task.status === 'pending' ? 'waiting' : 'in progress'} ${days}d — blocked?`,
        refId: task.id,
        detectedAt: now.toISOString(),
      });
    }
  }

  // 3. Failure spike — failed tasks in trailing 3d vs the prior 3d
  const windowStart = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const prevStart = new Date(windowStart.getTime() - 3 * 24 * 60 * 60 * 1000);
  const [failedCurrent] = await db
    .select({ n: count() })
    .from(tasks)
    .where(
      and(
        eq(tasks.orgId, orgId),
        eq(tasks.status, 'failed'),
        gte(tasks.updatedAt, windowStart),
        lt(tasks.updatedAt, now),
      ),
    );
  const [failedPrevious] = await db
    .select({ n: count() })
    .from(tasks)
    .where(
      and(
        eq(tasks.orgId, orgId),
        eq(tasks.status, 'failed'),
        gte(tasks.updatedAt, prevStart),
        lt(tasks.updatedAt, windowStart),
      ),
    );
  const failedNow = failedCurrent?.n ?? 0;
  const failedThen = failedPrevious?.n ?? 0;
  if (isFailureSpike(failedNow, failedThen)) {
    anomalies.push({
      severity: 'critical',
      category: 'failure',
      message: `Task failure spike: ${failedNow} failures in the last 3 days (vs ${failedThen} previously).`,
      refId: null,
      detectedAt: now.toISOString(),
    });
  }

  // 4. Spend spike — credit usage (negative amounts) trailing 3d vs prior 3d
  const [usageCurrent] = await db
    .select({ total: sql<number>`coalesce(abs(sum(${creditTransactions.amount})), 0)::int` })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.orgId, orgId),
        eq(creditTransactions.type, 'usage'),
        gte(creditTransactions.createdAt, windowStart),
        lt(creditTransactions.createdAt, now),
      ),
    );
  const [usagePrevious] = await db
    .select({ total: sql<number>`coalesce(abs(sum(${creditTransactions.amount})), 0)::int` })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.orgId, orgId),
        eq(creditTransactions.type, 'usage'),
        gte(creditTransactions.createdAt, prevStart),
        lt(creditTransactions.createdAt, windowStart),
      ),
    );
  const spentNow = usageCurrent?.total ?? 0;
  const spentThen = usagePrevious?.total ?? 0;
  if (isSpendSpike(spentNow, spentThen)) {
    anomalies.push({
      severity: 'warning',
      category: 'spend',
      message: `Credit spend spike: ${spentNow} credits used in the last 3 days (vs ${spentThen} previously).`,
      refId: null,
      detectedAt: now.toISOString(),
    });
  }

  anomalies.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  return { orgId, scannedAt: now.toISOString(), anomalies };
}

function severityRank(s: Anomaly['severity']): number {
  return s === 'critical' ? 0 : s === 'warning' ? 1 : 2;
}
