/**
 * ORQ8 Company Health — deterministic composite operational score.
 *
 * A single explainable 0–100 health score derived from REAL org data:
 * goals (stalled/at-risk), tasks (completion, backlog, blocked), agent
 * reliability (completion/failure), approvals (pending/rejected load),
 * credits (spend relative to trailing usage), and connectors (degraded/
 * disconnected). Every deduction carries a human-readable reason so the
 * founder never sees an unexplained number.
 *
 * The score is a pure function of the supplied aggregate: identical inputs
 * always yield identical output (no LLM, no randomness), and the reasons are
 * deterministically ordered (critical → warning → info).
 */

import { eq, and, gte } from 'drizzle-orm';
import { goals, tasks, approvals, creditTransactions, integrationProviders, type Db } from '@orq8/db';
import {
  isStalledGoal,
  isAtRiskGoal,
  STALL_DAYS,
  AT_RISK_HOURS,
  AT_RISK_PROGRESS,
  BLOCKED_DAYS,
  FAILURE_MIN,
  FAILURE_MULTIPLIER,
  SPEND_MIN,
  SPEND_MULTIPLIER,
} from './anomaly-detector.js';
import { getOrgReliabilityProfiles } from './agent-reliability.js';
import { aggregateOrgState } from './simulation.js';

// ─── Weight model (explicit tuning surface) ─────────────────────────────────

export const HEALTH_WEIGHTS = {
  goals: 25,
  tasks: 25,
  workforce: 25,
  approvals: 10,
  credits: 10,
  connectors: 5,
} as const;

export interface HealthFactor {
  key: keyof typeof HEALTH_WEIGHTS;
  label: string;
  /** 0–100 for this factor alone (weighted later). */
  score: number;
  weight: number;
  reasons: HealthReason[];
}

export type HealthReasonKind = 'positive' | 'warning' | 'critical' | 'info';

export interface HealthReason {
  kind: HealthReasonKind;
  message: string;
}

export interface CompanyHealth {
  orgId: string;
  score: number; // 0–100 composite
  grade: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  factors: HealthFactor[];
  reasons: HealthReason[]; // merged, ordered critical → warning → positive → info
  scannedAt: string;
}

// ─── Pure scoring helpers (unit-testable) ───────────────────────────────────

export function gradeForScore(score: number): CompanyHealth['grade'] {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  if (score >= 30) return 'poor';
  return 'critical';
}

export interface GoalHealthInput {
  totalGoals: number;
  activeGoals: number;
  stalled: number;
  atRisk: number;
  completedGoals: number;
}

export function scoreGoals(input: GoalHealthInput): { score: number; reasons: HealthReason[] } {
  const reasons: HealthReason[] = [];
  if (input.totalGoals === 0) {
    return { score: 60, reasons: [{ kind: 'info', message: 'No goals yet — define company goals to raise health.' }] };
  }
  let score = 100;
  if (input.stalled > 0) {
    score -= input.stalled * 15;
    reasons.push({ kind: 'critical', message: `${input.stalled} active goal(s) stalled for ${STALL_DAYS}+ days without progress.` });
  }
  if (input.atRisk > 0) {
    score -= input.atRisk * 10;
    reasons.push({ kind: 'warning', message: `${input.atRisk} goal(s) at risk — due within ${AT_RISK_HOURS}h but below ${AT_RISK_PROGRESS}% progress.` });
  }
  if (input.completedGoals > 0) {
    reasons.push({ kind: 'positive', message: `${input.completedGoals} goal(s) completed.` });
  }
  if (input.activeGoals > 0 && input.stalled === 0 && input.atRisk === 0) {
    reasons.push({ kind: 'positive', message: `${input.activeGoals} active goal(s) on track.` });
  }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}

export interface TaskHealthInput {
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
  blocked: number; // pending/in_progress/blocked older than BLOCKED_DAYS
  failedRecent: number; // failures in trailing 7d
  failedPrior: number; // failures in the 7d before that
}

export function scoreTasks(input: TaskHealthInput): { score: number; reasons: HealthReason[] } {
  const reasons: HealthReason[] = [];
  if (input.totalTasks === 0) {
    return { score: 65, reasons: [{ kind: 'info', message: 'No tasks yet — create or delegate work to raise health.' }] };
  }
  let score = 100;
  const completionRate = Math.round((input.completedTasks / input.totalTasks) * 100);
  if (completionRate < 60) {
    score -= (60 - completionRate) / 2;
    reasons.push({ kind: 'warning', message: `Task completion rate is ${completionRate}% — most work is not finishing.` });
  } else {
    reasons.push({ kind: 'positive', message: `Task completion rate ${completionRate}% across ${input.totalTasks} tasks.` });
  }
  if (input.blocked > 0) {
    score -= Math.min(30, input.blocked * 8);
    reasons.push({ kind: 'critical', message: `${input.blocked} task(s) blocked or aging ${BLOCKED_DAYS}+ days without progress.` });
  }
  if (input.openTasks > input.completedTasks && input.completedTasks > 0) {
    score -= 5;
    reasons.push({ kind: 'warning', message: `Backlog exceeds completed work (${input.openTasks} open vs ${input.completedTasks} done).` });
  }
  if (input.failedRecent >= FAILURE_MIN && input.failedRecent >= input.failedPrior * FAILURE_MULTIPLIER) {
    score -= 15;
    reasons.push({ kind: 'critical', message: `Failure spike — ${input.failedRecent} failures in the last 7 days (${FAILURE_MULTIPLIER}× prior window).` });
  }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}

export interface WorkforceHealthInput {
  agentsWithData: number;
  avgCompletionRate: number;
  avgFailureRate: number;
  avgRevisionRate: number;
  declining: number;
  replaceRecommended: number;
}

export function scoreWorkforce(input: WorkforceHealthInput): { score: number; reasons: HealthReason[] } {
  const reasons: HealthReason[] = [];
  if (input.agentsWithData === 0) {
    return { score: 70, reasons: [{ kind: 'info', message: 'No AI employees with execution data yet — health builds as work is performed.' }] };
  }
  let score = 100;
  if (input.avgCompletionRate < 70) {
    score -= (70 - input.avgCompletionRate) / 2;
    reasons.push({ kind: 'warning', message: `Average AI completion rate is ${input.avgCompletionRate}%.` });
  } else {
    reasons.push({ kind: 'positive', message: `Average AI completion rate ${input.avgCompletionRate}% across ${input.agentsWithData} employee(s).` });
  }
  if (input.avgFailureRate > 20) {
    score -= Math.min(25, (input.avgFailureRate - 20));
    reasons.push({ kind: 'warning', message: `Average failure rate ${input.avgFailureRate}% is elevated.` });
  }
  if (input.avgRevisionRate > 30) {
    score -= Math.min(15, (input.avgRevisionRate - 30) / 2);
    reasons.push({ kind: 'warning', message: `Average revision rate ${input.avgRevisionRate}% — output frequently misses on first pass.` });
  }
  if (input.declining > 0) {
    score -= Math.min(15, input.declining * 5);
    reasons.push({ kind: 'warning', message: `${input.declining} employee(s) trending downward.` });
  }
  if (input.replaceRecommended > 0) {
    score -= Math.min(20, input.replaceRecommended * 10);
    reasons.push({ kind: 'critical', message: `${input.replaceRecommended} employee(s) recommended for replacement/escalation.` });
  }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}

export interface ApprovalHealthInput {
  pending: number;
  rejected: number;
  totalDecided: number;
}

export function scoreApprovals(input: ApprovalHealthInput): { score: number; reasons: HealthReason[] } {
  const reasons: HealthReason[] = [];
  let score = 100;
  if (input.pending > 5) {
    score -= Math.min(30, input.pending * 3);
    reasons.push({ kind: 'warning', message: `${input.pending} approval(s) awaiting a decision.` });
  } else if (input.pending > 0) {
    reasons.push({ kind: 'info', message: `${input.pending} approval(s) awaiting a decision.` });
  }
  if (input.totalDecided > 0 && input.rejected / input.totalDecided > 0.4) {
    score -= 10;
    reasons.push({ kind: 'warning', message: `High rejection rate (${Math.round((input.rejected / input.totalDecided) * 100)}%) — agents may be requesting inappropriate actions.` });
  }
  if (input.pending === 0 && input.totalDecided === 0) {
    reasons.push({ kind: 'info', message: 'No approvals yet.' });
  }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}

export interface CreditHealthInput {
  spend7d: number;
  spendPrior7d: number;
  avgCreditsPerTask: number;
}

export function scoreCredits(input: CreditHealthInput): { score: number; reasons: HealthReason[] } {
  const reasons: HealthReason[] = [];
  if (input.spend7d === 0 && input.spendPrior7d === 0) {
    return { score: 85, reasons: [{ kind: 'info', message: 'No credit spend in the trailing 14 days.' }] };
  }
  let score = 100;
  if (input.spend7d >= SPEND_MIN && input.spend7d >= input.spendPrior7d * SPEND_MULTIPLIER) {
    score -= 20;
    reasons.push({ kind: 'critical', message: `Credit spend spike — ${input.spend7d} credits in 7 days (${SPEND_MULTIPLIER}× prior window).` });
  } else {
    reasons.push({ kind: 'positive', message: `${input.spend7d} credits used in the last 7 days${input.avgCreditsPerTask > 0 ? ` (~${input.avgCreditsPerTask}/task)` : ''}.` });
  }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}

export interface ConnectorHealthInput {
  total: number;
  degraded: number; // status not in (disconnected) and lastErrorAt within 7d
}

export function scoreConnectors(input: ConnectorHealthInput): { score: number; reasons: HealthReason[] } {
  const reasons: HealthReason[] = [];
  if (input.total === 0) {
    return { score: 80, reasons: [{ kind: 'info', message: 'No integrations connected yet.' }] };
  }
  let score = 100;
  if (input.degraded > 0) {
    score -= Math.min(30, input.degraded * 10);
    reasons.push({ kind: 'warning', message: `${input.degraded} integration(s) degraded or recently failing.` });
  } else {
    reasons.push({ kind: 'positive', message: `${input.total} integration(s) healthy.` });
  }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}

// ─── Composite (pure, testable) ─────────────────────────────────────────────

export function computeHealth(
  orgId: string,
  factors: HealthFactor[],
  scannedAt = new Date().toISOString(),
): CompanyHealth {
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0) || 1;
  const score = Math.round(
    factors.reduce((sum, f) => sum + f.score * (f.weight / totalWeight), 0),
  );
  const reasons = [...factors.flatMap((f) => f.reasons)].sort((a, b) => {
    const order: Record<HealthReasonKind, number> = { critical: 0, warning: 1, positive: 2, info: 3 };
    return order[a.kind] - order[b.kind];
  });
  return {
    orgId,
    score,
    grade: gradeForScore(score),
    factors,
    reasons,
    scannedAt,
  };
}

// ─── Live aggregate (org-scoped) ────────────────────────────────────────────

/**
 * Compute the current Company Health from live org data. Every number comes
 * from the org's own tables; the composite is deterministic for identical
 * state. Org-isolated by construction — every query filters on orgId.
 */
export async function getCompanyHealth(db: Db, orgId: string, now = new Date()): Promise<CompanyHealth> {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const blockedSince = new Date(now.getTime() - BLOCKED_DAYS * 24 * 60 * 60 * 1000);

  // Goals
  const goalRows = await db.select().from(goals).where(eq(goals.orgId, orgId));
  const activeGoals = goalRows.filter((g) => g.status === 'active');
  const stalled = activeGoals.filter((g) => isStalledGoal(g.updatedAt, now)).length;
  const atRisk = activeGoals.filter((g) => isAtRiskGoal(g.dueDate, g.progress ?? 0, now)).length;
  const goalHealth = scoreGoals({
    totalGoals: goalRows.length,
    activeGoals: activeGoals.length,
    stalled,
    atRisk,
    completedGoals: goalRows.filter((g) => g.status === 'completed').length,
  });

  // Tasks
  const taskRows = await db.select().from(tasks).where(eq(tasks.orgId, orgId));
  const taskHealth = scoreTasks({
    totalTasks: taskRows.length,
    completedTasks: taskRows.filter((t) => t.status === 'completed').length,
    openTasks: taskRows.filter((t) => ['pending', 'in_progress', 'blocked'].includes(t.status)).length,
    blocked: taskRows.filter((t) => ['pending', 'in_progress', 'blocked'].includes(t.status) && t.updatedAt.getTime() < blockedSince.getTime()).length,
    failedRecent: taskRows.filter((t) => t.status === 'failed' && t.updatedAt.getTime() >= weekAgo.getTime()).length,
    failedPrior: taskRows.filter((t) => t.status === 'failed' && t.updatedAt.getTime() >= twoWeeksAgo.getTime() && t.updatedAt.getTime() < weekAgo.getTime()).length,
  });

  // Workforce — reuse the reliability profiles (real telemetry).
  const profiles = await getOrgReliabilityProfiles(db, orgId);
  const withData = profiles.filter((p) => p.totalTasks > 0);
  const workforceHealth = scoreWorkforce({
    agentsWithData: withData.length,
    avgCompletionRate: withData.length ? Math.round(withData.reduce((s, p) => s + p.completionRate, 0) / withData.length) : 0,
    avgFailureRate: withData.length ? Math.round(withData.reduce((s, p) => s + p.failureRate, 0) / withData.length) : 0,
    avgRevisionRate: withData.length ? Math.round(withData.reduce((s, p) => s + p.revisionRate, 0) / withData.length) : 0,
    declining: profiles.filter((p) => p.trend === 'declining').length,
    replaceRecommended: profiles.filter((p) => p.recommendation === 'REPLACE / ESCALATE').length,
  });

  // Approvals
  const approvalRows = await db.select().from(approvals).where(eq(approvals.orgId, orgId));
  const approvalHealth = scoreApprovals({
    pending: approvalRows.filter((a) => a.status === 'pending').length,
    rejected: approvalRows.filter((a) => a.status === 'rejected').length,
    totalDecided: approvalRows.filter((a) => a.status === 'approved' || a.status === 'rejected').length,
  });

  // Credits — actual usage transactions, trailing windows.
  const creditRows = await db
    .select({ amount: creditTransactions.amount, createdAt: creditTransactions.createdAt })
    .from(creditTransactions)
    .where(and(eq(creditTransactions.orgId, orgId), eq(creditTransactions.type, 'usage'), gte(creditTransactions.createdAt, twoWeeksAgo)));
  const spend7d = Math.abs(creditRows.filter((c) => c.createdAt.getTime() >= weekAgo.getTime()).reduce((s, c) => s + c.amount, 0));
  const spendPrior = Math.abs(creditRows.filter((c) => c.createdAt.getTime() >= twoWeeksAgo.getTime() && c.createdAt.getTime() < weekAgo.getTime()).reduce((s, c) => s + c.amount, 0));
  const creditHealth = scoreCredits({ spend7d, spendPrior7d: spendPrior, avgCreditsPerTask: (await aggregateOrgState(db, orgId, now)).avgCreditsPerTask });

  // Connectors — real provider rows; degraded = connected-ish but erroring recently.
  const providerRows = await db
    .select({ status: integrationProviders.status, error: integrationProviders.error, lastInteractionAt: integrationProviders.lastInteractionAt })
    .from(integrationProviders)
    .where(eq(integrationProviders.orgId, orgId));
  const connected = providerRows.filter((p) => p.status !== 'disconnected');
  // Degraded = attached but erroring, or quiet for the whole week (no interaction).
  const degraded = connected.filter((p) => p.error != null || (p.lastInteractionAt && p.lastInteractionAt.getTime() < weekAgo.getTime())).length;
  const connectorHealth = scoreConnectors({ total: connected.length, degraded });

  const factors: HealthFactor[] = [
    { key: 'goals', label: 'Goals', score: goalHealth.score, weight: HEALTH_WEIGHTS.goals, reasons: goalHealth.reasons },
    { key: 'tasks', label: 'Tasks & Delivery', score: taskHealth.score, weight: HEALTH_WEIGHTS.tasks, reasons: taskHealth.reasons },
    { key: 'workforce', label: 'AI Workforce', score: workforceHealth.score, weight: HEALTH_WEIGHTS.workforce, reasons: workforceHealth.reasons },
    { key: 'approvals', label: 'Approvals', score: approvalHealth.score, weight: HEALTH_WEIGHTS.approvals, reasons: approvalHealth.reasons },
    { key: 'credits', label: 'Credits & Spend', score: creditHealth.score, weight: HEALTH_WEIGHTS.credits, reasons: creditHealth.reasons },
    { key: 'connectors', label: 'Integrations', score: connectorHealth.score, weight: HEALTH_WEIGHTS.connectors, reasons: connectorHealth.reasons },
  ];

  return computeHealth(orgId, factors, now.toISOString());
}