/**
 * Founder's Attention service (docs/61 Phase 3).
 *
 * One aggregation over the real operational tables: pending approvals and tool
 * permission requests, blocked critical work, failed work awaiting review,
 * unacknowledged Work Credit alerts, goal deadlines at risk, and council
 * escalations awaiting the founder's verdict.
 *
 * Every item traces to a row. Nothing is synthesized and nothing is estimated,
 * and a quiet company produces an empty list (the page then offers the next
 * real action). Classification and ordering are pure functions so the
 * thresholds are unit tested without a database.
 *
 * This is the only place the attention queue is assembled: the dashboard's
 * ad-hoc derivation is replaced by this API as the hub phases land.
 */

import { and, desc, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import {
  agents,
  approvals,
  creditAlerts,
  decisions,
  goals,
  tasks,
  type Db,
} from '@orq8/db';
import {
  AT_RISK_HOURS,
  AT_RISK_PROGRESS,
  BLOCKED_DAYS,
  isAtRiskGoal,
  isBlockedTask,
} from './anomaly-detector.js';
import { broadcastToOrg } from './realtime.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export type AttentionSource =
  | 'approval'
  | 'permission'
  | 'blocked_work'
  | 'failure'
  | 'credits'
  | 'deadline'
  | 'escalation';

export type AttentionSeverity = 'critical' | 'warning' | 'info';

export type AttentionActionKind =
  | 'approve'
  | 'reject'
  | 'retry'
  | 'pause'
  | 'cancel'
  | 'acknowledge'
  | 'ask_ea';

export interface AttentionAction {
  kind: AttentionActionKind;
  label: string;
  /** API path (the web proxy forwards to it). Absent for ask_ea. */
  endpoint?: string;
  method?: 'PATCH' | 'POST';
  payload?: Record<string, unknown>;
  /** Starter prompt handed to the Executive Agent (ask_ea only). */
  prompt?: string;
}

export interface AttentionItem {
  /** Stable across refetches: `${source}:${rowId}`. */
  id: string;
  source: AttentionSource;
  severity: AttentionSeverity;
  what: string;
  why: string;
  who: string | null;
  authority: string;
  impact: string | null;
  next: string;
  entity: {
    type: 'approval' | 'task' | 'goal' | 'credit_alert' | 'decision';
    id: string;
  };
  createdAt: string;
  dueAt: string | null;
  actions: AttentionAction[];
}

export interface AttentionSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
  bySource: Record<AttentionSource, number>;
}

export interface AttentionResult {
  items: AttentionItem[];
  summary: AttentionSummary;
  generatedAt: string;
  /** True when nothing needs the founder: an honest all-clear. */
  quiet: boolean;
  /** True when a source was capped, so older items exist beyond the list. */
  truncated: boolean;
}

export interface AttentionLimits {
  approvals: number;
  blocked: number;
  failures: number;
  credits: number;
  deadlines: number;
  escalations: number;
  total: number;
}

export interface AttentionOptions {
  now?: Date;
  /** Executive Agent display name, used in the "ask the EA" prompts. */
  eaName?: string;
  limits?: Partial<AttentionLimits>;
}

export const DEFAULT_ATTENTION_LIMITS: AttentionLimits = {
  approvals: 40,
  blocked: 25,
  failures: 25,
  credits: 10,
  deadlines: 25,
  escalations: 25,
  total: 50,
};

/** Failed work stays in the review queue for this long, then leaves it. */
export const FAILURE_REVIEW_DAYS = 7;

export const ATTENTION_SEVERITY_RANK: Record<AttentionSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** Decisions the founder owes come before information about the company. */
export const ATTENTION_SOURCE_RANK: Record<AttentionSource, number> = {
  approval: 0,
  permission: 1,
  escalation: 2,
  blocked_work: 3,
  failure: 4,
  credits: 5,
  deadline: 6,
};

export const ATTENTION_SOURCES: AttentionSource[] = [
  'approval',
  'permission',
  'blocked_work',
  'failure',
  'credits',
  'deadline',
  'escalation',
];

// ─── Pure helpers ──────────────────────────────────────────────────────────

/** Format cents (the unit every money column in the schema uses). */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * A tool permission request is an approval row created by the tool-registry
 * authority check ("Tool: <name>"); everything else is a business decision.
 */
export function isPermissionRequest(action: string): boolean {
  return /^tool:/i.test(action.trim()) || /wants to use tool/i.test(action);
}

export function approvalSource(action: string): 'permission' | 'approval' {
  return isPermissionRequest(action) ? 'permission' : 'approval';
}

export function approvalSeverity(riskLevel: string): AttentionSeverity {
  if (riskLevel === 'high') return 'critical';
  if (riskLevel === 'medium') return 'warning';
  return 'info';
}

export function blockedTaskSeverity(priority: string): AttentionSeverity {
  if (priority === 'urgent') return 'critical';
  if (priority === 'high') return 'warning';
  return 'info';
}

export function failureSeverity(priority: string, now: Date, updatedAt: Date): AttentionSeverity {
  // Fresh high-priority failures outrank everything informational.
  const fresh = now.getTime() - updatedAt.getTime() < 24 * 60 * 60 * 1000;
  if (priority === 'urgent' || (priority === 'high' && fresh)) return 'critical';
  return 'warning';
}

export function creditAlertSeverity(type: string): AttentionSeverity {
  if (type === 'exhausted' || type === 'critical') return 'critical';
  if (type === 'low') return 'warning';
  return 'info';
}

export function creditAlertLabel(type: string): string {
  if (type === 'exhausted') return 'Work Credits exhausted';
  if (type === 'critical') return 'Work Credits critically low';
  if (type === 'low') return 'Work Credits running low';
  if (type === 'warning') return 'Work Credits usage update';
  if (type === 'renewal_reminder') return 'Work Credits renew soon';
  return 'Work Credits alert';
}

export function deadlineSeverity(overdue: boolean): AttentionSeverity {
  return overdue ? 'critical' : 'warning';
}

export function urgencyLabel(priority: string): string {
  if (priority === 'urgent' || priority === 'high') return 'High priority work';
  return 'Work';
}

function daysSince(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
}

function hoursUntil(when: Date, now: Date): number {
  return Math.max(0, Math.round((when.getTime() - now.getTime()) / (60 * 60 * 1000)));
}

function excerpt(text: string | null | undefined, max = 240): string | null {
  if (!text) return null;
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function askEa(eaName: string, prompt: string): AttentionAction {
  return { kind: 'ask_ea', label: `Ask ${eaName}`, prompt };
}

/** Severity first, then source (decisions over information), then age. */
export function compareAttentionItems(a: AttentionItem, b: AttentionItem): number {
  const bySeverity = ATTENTION_SEVERITY_RANK[a.severity] - ATTENTION_SEVERITY_RANK[b.severity];
  if (bySeverity !== 0) return bySeverity;
  const bySource = ATTENTION_SOURCE_RANK[a.source] - ATTENTION_SOURCE_RANK[b.source];
  if (bySource !== 0) return bySource;
  const byAge = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (byAge !== 0) return byAge;
  return a.id.localeCompare(b.id);
}

export function summarizeAttention(items: AttentionItem[]): AttentionSummary {
  const bySource = {} as Record<AttentionSource, number>;
  for (const source of ATTENTION_SOURCES) bySource[source] = 0;
  let critical = 0;
  let warning = 0;
  let info = 0;
  for (const item of items) {
    bySource[item.source] += 1;
    if (item.severity === 'critical') critical += 1;
    else if (item.severity === 'warning') warning += 1;
    else info += 1;
  }
  return { total: items.length, critical, warning, info, bySource };
}

// ─── Item builders ─────────────────────────────────────────────────────────

export interface ApprovalRow {
  id: string;
  action: string;
  description: string | null;
  cost: number;
  riskLevel: string;
  createdAt: Date;
  agentName: string | null;
  agentRole: string | null;
  // The work this gate holds (migration 0036). Optional so the classifier stays
  // callable without a join, but when it is present the founder is told what
  // their decision actually moves instead of being asked to rule on a sentence.
  taskId?: string | null;
  taskTitle?: string | null;
  toolId?: string | null;
}

export function classifyApproval(row: ApprovalRow, eaName: string): AttentionItem {
  const source = approvalSource(row.action);
  const severity = approvalSeverity(row.riskLevel);
  const who = row.agentName ?? 'Executive Agent';
  const costImpact = row.cost > 0 ? `${formatCents(row.cost)} of Work Credits at stake` : null;
  const riskImpact = row.riskLevel === 'high' ? 'High risk action' : row.riskLevel === 'medium' ? 'Medium risk action' : null;
  // A gate that does not name the work it gates asks the founder to rule on
  // nothing (docs/66.14 Gap A). Name the task when the row carries one, and the
  // tool when the gate came from a tool call.
  const blocked = row.taskTitle ? `“${row.taskTitle}”` : null;
  const viaTool = row.toolId ? `the \`${row.toolId}\` tool` : null;
  const whatItBlocks = blocked ?? viaTool;
  const base = excerpt(row.description) ?? (source === 'permission'
    ? `${who} asked for permission to run a gated tool.`
    : `${who} is waiting on a decision before it can proceed.`);
  // The blocked work leads, whether or not the agent recorded context: what the
  // decision moves is the first thing the founder needs, and the agent's note is
  // the second.
  const why = whatItBlocks
    ? `${who} is stopped on ${whatItBlocks} until you decide. ${base}`
    : base;

  return {
    id: `${source}:${row.id}`,
    source,
    severity,
    what: row.action,
    why,
    who,
    authority: blocked
      ? `Nothing runs until you decide: approving resumes ${blocked} and spends the grant; rejecting stops it and keeps your reason.`
      : viaTool
        ? `${who} cannot run ${viaTool} under its authority profile until you approve it.`
        : source === 'permission'
          ? `${who} cannot run this tool under its authority profile until you approve it.`
          : 'Nothing is executed before your decision; approving records the decision and releases the action.',
    impact: costImpact ?? riskImpact,
    next: 'Approve or reject this request.',
    entity: { type: 'approval', id: row.id },
    createdAt: row.createdAt.toISOString(),
    dueAt: null,
    actions: [
      {
        kind: 'approve',
        label: 'Approve',
        endpoint: `/v1/approvals/${row.id}`,
        method: 'PATCH',
        payload: { status: 'approved' },
      },
      {
        kind: 'reject',
        label: 'Reject',
        endpoint: `/v1/approvals/${row.id}`,
        method: 'PATCH',
        payload: { status: 'rejected' },
      },
      askEa(eaName, `Explain what approving "${row.action}" would do, and what happens if I reject it.`),
    ],
  };
}

export interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  result?: string | null;
  createdAt: Date;
  updatedAt: Date;
  dueDate?: Date | null;
  agentName: string | null;
}

export function classifyBlockedTask(row: TaskRow, now: Date, eaName: string): AttentionItem {
  const days = daysSince(row.updatedAt, now);
  const who = row.agentName ?? 'Unassigned';

  return {
    id: `blocked_work:${row.id}`,
    source: 'blocked_work',
    severity: blockedTaskSeverity(row.priority),
    what: row.title,
    why: `No progress for ${days} day${days === 1 ? '' : 's'} while marked ${row.status === 'pending' ? 'waiting' : 'in progress'}.`,
    who,
    authority: 'You own the priority call: unblock, reassign, or cancel the work.',
    impact: `${urgencyLabel(row.priority)} is stalled`,
    next: 'Cancel it, or ask the Executive Agent how to unblock it.',
    entity: { type: 'task', id: row.id },
    createdAt: row.createdAt.toISOString(),
    dueAt: row.dueDate ? row.dueDate.toISOString() : null,
    actions: [
      {
        kind: 'cancel',
        label: 'Cancel task',
        endpoint: `/v1/tasks/${row.id}`,
        method: 'PATCH',
        payload: { status: 'cancelled' },
      },
      askEa(eaName, `Task "${row.title}" has been stuck for ${days} days. What is blocking it and what should I do?`),
    ],
  };
}

export function classifyFailedTask(row: TaskRow, now: Date, eaName: string): AttentionItem {
  const reason = excerpt(row.result, 200);
  const who = row.agentName ?? 'Unassigned';

  return {
    id: `failure:${row.id}`,
    source: 'failure',
    severity: failureSeverity(row.priority, now, row.updatedAt),
    what: row.title,
    why: reason ? `Last attempt failed: ${reason}` : 'The last attempt failed and nothing is retrying it.',
    who,
    authority: 'You decide whether to retry, cancel, or change the approach.',
    impact: `${urgencyLabel(row.priority)} needs review`,
    next: 'Retry the task or cancel it.',
    entity: { type: 'task', id: row.id },
    createdAt: row.createdAt.toISOString(),
    dueAt: row.dueDate ? row.dueDate.toISOString() : null,
    actions: [
      {
        // The real retry path (docs/66 §66.19): it re-runs the work and reports
        // the outcome. Patching the status back to `pending` only requeued it,
        // so the button claimed a retry and then left the founder to trigger it
        // a second time from the batch runner.
        kind: 'retry',
        label: 'Retry',
        endpoint: `/v1/commands/tasks/${row.id}/retry`,
        method: 'POST',
        payload: {},
      },
      {
        kind: 'cancel',
        label: 'Cancel task',
        endpoint: `/v1/tasks/${row.id}`,
        method: 'PATCH',
        payload: { status: 'cancelled' },
      },
      askEa(eaName, `Task "${row.title}" failed. Why did it fail and should I retry it?`),
    ],
  };
}

export interface CreditAlertRow {
  id: string;
  type: string;
  message: string;
  sentAt: Date;
  metadata: Record<string, unknown> | null;
}

export function classifyCreditAlert(row: CreditAlertRow, eaName: string): AttentionItem {
  const meta = row.metadata ?? {};
  const remaining = typeof meta.remaining === 'number' ? meta.remaining : null;
  const total = typeof meta.total === 'number' ? meta.total : null;
  const impact = remaining !== null && total !== null
    ? `${remaining} of ${total} credits remaining this period`
    : null;

  return {
    id: `credits:${row.id}`,
    source: 'credits',
    severity: creditAlertSeverity(row.type),
    what: creditAlertLabel(row.type),
    why: row.message,
    who: null,
    authority: 'Work Credits fund every AI employee action; you decide whether to top up or change the plan.',
    impact,
    next: 'Acknowledge the alert or review Work Credits.',
    entity: { type: 'credit_alert', id: row.id },
    createdAt: row.sentAt.toISOString(),
    dueAt: null,
    actions: [
      {
        kind: 'acknowledge',
        label: 'Acknowledge',
        endpoint: `/v1/credits/alerts/${row.id}/read`,
        method: 'PATCH',
        payload: {},
      },
      askEa(eaName, `Work Credits are running low. Which work should I pause first, and what will a top-up cost?`),
    ],
  };
}

export interface GoalRow {
  id: string;
  title: string;
  progress: number;
  priority: string;
  dueDate: Date | null;
  createdAt: Date;
}

export function classifyGoalDeadline(row: GoalRow, now: Date, eaName: string): AttentionItem {
  const due = row.dueDate as Date;
  const overdue = due.getTime() < now.getTime();
  const why = overdue
    ? `Overdue by ${daysSince(due, now)} day${daysSince(due, now) === 1 ? '' : 's'} at ${row.progress}% progress.`
    : `Due in about ${hoursUntil(due, now)}h at ${row.progress}% progress.`;

  return {
    id: `deadline:${row.id}`,
    source: 'deadline',
    severity: deadlineSeverity(overdue),
    what: row.title,
    why,
    who: null,
    authority: 'You set the deadline; the work can be re-planned or paused.',
    impact: `${row.progress}% complete`,
    next: overdue ? 'Re-plan the goal or pause it.' : 'Decide whether the deadline still holds.',
    entity: { type: 'goal', id: row.id },
    createdAt: row.createdAt.toISOString(),
    dueAt: due.toISOString(),
    actions: [
      {
        kind: 'pause',
        label: 'Pause goal',
        endpoint: `/v1/goals/${row.id}`,
        method: 'PATCH',
        payload: { status: 'paused' },
      },
      askEa(eaName, `Goal "${row.title}" is ${overdue ? 'overdue' : 'close to its deadline'} at ${row.progress}%. What should change?`),
    ],
  };
}

export interface DecisionRow {
  id: string;
  title: string;
  confidence: string;
  whatWasDecided: string;
  createdAt: Date;
}

export function classifyEscalation(row: DecisionRow, eaName: string): AttentionItem {
  const recommendation = excerpt(row.whatWasDecided, 200);

  return {
    id: `escalation:${row.id}`,
    source: 'escalation',
    severity: 'critical',
    what: row.title,
    why: recommendation
      ? `The council flagged this for your approval. Recommendation: ${recommendation}`
      : 'The council flagged this recommendation for your approval.',
    who: 'Decision Council',
    authority: 'The council never executes. Your verdict is the authorisation.',
    impact: `Council confidence: ${row.confidence}`,
    next: 'Record your verdict on the recommendation.',
    entity: { type: 'decision', id: row.id },
    createdAt: row.createdAt.toISOString(),
    dueAt: null,
    actions: [
      {
        kind: 'approve',
        label: 'Approve',
        endpoint: `/v1/decisions/${row.id}`,
        method: 'PATCH',
        payload: { founderVerdict: 'approved' },
      },
      {
        kind: 'reject',
        label: 'Reject',
        endpoint: `/v1/decisions/${row.id}`,
        method: 'PATCH',
        payload: { founderVerdict: 'rejected' },
      },
      askEa(eaName, `Walk me through the council recommendation "${row.title}" before I decide.`),
    ],
  };
}

// ─── Aggregation ───────────────────────────────────────────────────────────

/**
 * Collect the founder's attention queue for one organization.
 *
 * Bounded: each source is capped (see DEFAULT_ATTENTION_LIMITS) and the merged
 * list is capped again, so the endpoint stays fast regardless of company size.
 * `truncated` reports when a cap was hit so the UI never implies completeness
 * it does not have.
 */
export async function collectAttention(
  db: Db,
  orgId: string,
  options: AttentionOptions = {},
): Promise<AttentionResult> {
  const now = options.now ?? new Date();
  const eaName = options.eaName ?? 'the Executive Agent';
  const limits = { ...DEFAULT_ATTENTION_LIMITS, ...options.limits };
  const truncated = { any: false };

  const cap = <T>(rows: T[], limit: number): T[] => {
    if (rows.length > limit) {
      truncated.any = true;
      return rows.slice(0, limit);
    }
    return rows;
  };

  // 1. Pending approvals and tool permission requests.
  const pendingApprovalRows = await db
    .select({
      id: approvals.id,
      action: approvals.action,
      description: approvals.description,
      cost: approvals.cost,
      riskLevel: approvals.riskLevel,
      createdAt: approvals.createdAt,
      agentName: agents.name,
      agentRole: agents.role,
      taskId: approvals.taskId,
      toolId: approvals.toolId,
      taskTitle: tasks.title,
    })
    .from(approvals)
    .leftJoin(agents, eq(approvals.agentId, agents.id))
    .leftJoin(tasks, eq(approvals.taskId, tasks.id))
    .where(and(eq(approvals.orgId, orgId), eq(approvals.status, 'pending')))
    .orderBy(approvals.createdAt)
    .limit(limits.approvals + 1);

  const approvalItems = cap(pendingApprovalRows, limits.approvals)
    .map((row) => classifyApproval(row, eaName));

  // 2. Blocked critical work: high or urgent tasks with no movement past the
  //    blocked threshold (the same threshold the anomaly detector uses).
  const openTaskRows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      dueDate: tasks.dueDate,
      agentName: agents.name,
    })
    .from(tasks)
    .leftJoin(agents, eq(tasks.agentId, agents.id))
    .where(
      and(
        eq(tasks.orgId, orgId),
        inArray(tasks.priority, ['high', 'urgent']),
        sql`${tasks.status} NOT IN ('completed', 'failed', 'cancelled')`,
      ),
    )
    .orderBy(tasks.updatedAt)
    .limit(limits.blocked + 1);

  const blockedItems = cap(
    openTaskRows.filter((row) => isBlockedTask(row.updatedAt, now)),
    limits.blocked,
  ).map((row) => classifyBlockedTask(row, now, eaName));

  // 3. Failures needing review: recent failed work, newest first.
  const failureSince = new Date(now.getTime() - FAILURE_REVIEW_DAYS * 24 * 60 * 60 * 1000);
  const failedTaskRows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      result: tasks.result,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      dueDate: tasks.dueDate,
      agentName: agents.name,
    })
    .from(tasks)
    .leftJoin(agents, eq(tasks.agentId, agents.id))
    .where(and(eq(tasks.orgId, orgId), eq(tasks.status, 'failed'), lt(tasks.updatedAt, now)))
    .orderBy(desc(tasks.updatedAt))
    .limit(limits.failures + 1);

  const failureItems = cap(failedTaskRows, limits.failures)
    .map((row) => classifyFailedTask(row, now, eaName));

  // 4. Credit alerts the founder has not acknowledged.
  const alertRows = await db
    .select({
      id: creditAlerts.id,
      type: creditAlerts.type,
      message: creditAlerts.message,
      sentAt: creditAlerts.sentAt,
      metadata: creditAlerts.metadata,
    })
    .from(creditAlerts)
    .where(and(eq(creditAlerts.orgId, orgId), isNull(creditAlerts.readAt)))
    .orderBy(desc(creditAlerts.sentAt))
    .limit(limits.credits + 1);

  const creditItems = cap(alertRows, limits.credits)
    .map((row) => classifyCreditAlert({ ...row, metadata: row.metadata as Record<string, unknown> | null }, eaName));

  // 5. Goal deadlines: overdue, or inside the at-risk window below the
  //    progress floor (same window as the anomaly detector).
  const atRiskHorizon = new Date(now.getTime() + AT_RISK_HOURS * 60 * 60 * 1000);
  const goalRows = await db
    .select({
      id: goals.id,
      title: goals.title,
      progress: goals.progress,
      priority: goals.priority,
      dueDate: goals.dueDate,
      createdAt: goals.createdAt,
    })
    .from(goals)
    .where(
      and(
        eq(goals.orgId, orgId),
        eq(goals.status, 'active'),
        sql`${goals.dueDate} IS NOT NULL`,
        sql`${goals.dueDate} <= ${atRiskHorizon.toISOString()}`,
      ),
    )
    .orderBy(goals.dueDate)
    .limit(limits.deadlines + 1);

  const deadlineItems = cap(
    goalRows.filter((row) =>
      row.dueDate !== null
      && (row.dueDate.getTime() <= now.getTime()
        || isAtRiskGoal(row.dueDate, row.progress, now, AT_RISK_HOURS, AT_RISK_PROGRESS)),
    ),
    limits.deadlines,
  ).map((row) => classifyGoalDeadline({ ...row, dueDate: row.dueDate! }, now, eaName));

  // 6. Council escalations: completed council sessions that flagged a founder
  //    approval and have no verdict yet.
  const escalationRows = await db
    .select({
      id: decisions.id,
      title: decisions.title,
      confidence: decisions.confidence,
      whatWasDecided: decisions.whatWasDecided,
      createdAt: decisions.createdAt,
    })
    .from(decisions)
    .where(
      and(
        eq(decisions.orgId, orgId),
        eq(decisions.decisionMakerType, 'ai_council'),
        ne(decisions.status, 'pending'),
        isNull(decisions.founderVerdict),
        sql`(${decisions.councilDetail} ->> 'requiresFounderApproval') = 'true'`,
      ),
    )
    .orderBy(desc(decisions.createdAt))
    .limit(limits.escalations + 1);

  const escalationItems = cap(escalationRows, limits.escalations)
    .map((row) => classifyEscalation(row, eaName));

  // Merge, order, cap.
  const merged = [
    ...approvalItems,
    ...blockedItems,
    ...failureItems,
    ...creditItems,
    ...deadlineItems,
    ...escalationItems,
  ].sort(compareAttentionItems);

  let items = merged;
  if (merged.length > limits.total) {
    truncated.any = true;
    items = merged.slice(0, limits.total);
  }

  const summary = summarizeAttention(items);

  return {
    items,
    summary,
    generatedAt: now.toISOString(),
    quiet: summary.total === 0,
    truncated: truncated.any,
  };
}

/**
 * Broadcast that the attention queue changed so the badge and the page
 * refetch immediately instead of waiting for the polling fallback.
 */
export function notifyAttentionChanged(orgId: string, reason: string): void {
  broadcastToOrg(orgId, { type: 'attention.changed', reason });
}
