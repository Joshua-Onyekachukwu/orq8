/**
 * Daily executive briefing service (Phases 11–12).
 *
 * A scheduled pass (POST /v1/internal/briefings/daily via cron) summarizes each
 * org's real system activity since its last briefing: agent actions, task
 * completions/failures, connector outcomes, pending (and aging) approvals, goal
 * status, and anomalies. Every metric originates from the operational tables —
 * nothing is fabricated. Quiet orgs (no meaningful activity) get a `quiet: true`
 * briefing and skip delivery rather than generating noise.
 *
 * Idempotency: one row per (org, kind, period_start) — a scheduler retry never
 * duplicates a briefing. Delivery (in-app notification + email, when prefs allow)
 * happens once, after the row is inserted.
 */

import { and, asc, count, desc, eq, gte, lt, sql } from 'drizzle-orm';
import {
  activityEvents,
  agents,
  approvals,
  briefings,
  connectorOutcomes,
  creditTransactions,
  goals,
  memberships,
  organizations,
  tasks,
  users,
  webhookEvents,
  type Briefing,
  type Db,
} from '@orq8/db';
import type { AppConfig } from '@orq8/core';
import type { Logger } from 'pino';
import { scanOrgAnomalies } from './anomaly-detector.js';
import { createEmailTransport } from '../email/transport.js';
import { createNotification } from '../routes/notifications.js';
import { getNotificationPrefs } from './notification-preferences.js';
import { appendAudit } from './audit.js';

export interface BriefingSection {
  heading: string;
  items: string[];
}

export interface BriefingContent {
  quiet: boolean;
  periodStart: string;
  periodEnd: string;
  sections: BriefingSection[];
  stats: {
    tasksCompleted: number;
    tasksFailed: number;
    approvalsPending: number;
    approvalsAging: number;
    goalsActive: number;
    goalsOverdue: number;
    connectorOutcomes: number;
    webhookEvents: number;
    agentsPaused: number;
  };
}

export type BriefingKind = 'daily' | 'weekly' | 'monthly';

/** UTC-midnight start of the day containing `now`. */
export function dayStart(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** UTC start of the week (Monday 00:00) containing `now`. */
export function weekStart(now: Date): Date {
  const d = new Date(now);
  const day = d.getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (day + 6) % 7;
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
}

/** UTC start of the calendar month containing `now`. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Resolve a briefing's deterministic period for a kind. Pure + shareable. */
export function periodFor(kind: BriefingKind, now: Date): { periodStart: Date; periodEnd: Date; label: string } {
  switch (kind) {
    case 'weekly': {
      const start = weekStart(now);
      return { periodStart: start, periodEnd: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000), label: 'Weekly' };
    }
    case 'monthly': {
      const start = monthStart(now);
      return { periodStart: start, periodEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)), label: 'Monthly' };
    }
    case 'daily':
    default: {
      const start = dayStart(now);
      return { periodStart: start, periodEnd: new Date(start.getTime() + 24 * 60 * 60 * 1000), label: 'Daily' };
    }
  }
}

/**
 * Pure: how many whole periods fit between two dates (guards division by zero).
 */
export function periodDeltaLabel(current: number, previous: number): string | null {
  if (previous <= 0 && current <= 0) return null;
  if (previous <= 0) return `${current} (new — no prior activity)`;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return `${current} (no change)`;
  return `${current} (${pct > 0 ? '+' : ''}${pct}% vs previous)`;
}

/** Determine whether a pending approval is aging (older than 24h). */
export function isAging(createdAt: Date, now = new Date()): boolean {
  return now.getTime() - createdAt.getTime() > 24 * 60 * 60 * 1000;
}

/**
 * Gather real activity for an org since the previous briefing period.
 * All counts come from the operational tables — no sample data.
 */
export async function buildBriefingContent(
  db: Db,
  orgId: string,
  since: Date,
  until: Date,
  now = new Date(),
): Promise<BriefingContent> {
  const conditions = [eq(tasks.orgId, orgId), gte(tasks.updatedAt, since), lt(tasks.updatedAt, until)];

  const [completedRow] = await db
    .select({ n: count() })
    .from(tasks)
    .where(and(...conditions, eq(tasks.status, 'completed')));
  const [failedRow] = await db
    .select({ n: count() })
    .from(tasks)
    .where(and(...conditions, eq(tasks.status, 'failed')));

  const [pendingRow] = await db
    .select({ n: count() })
    .from(approvals)
    .where(and(eq(approvals.orgId, orgId), eq(approvals.status, 'pending')));
  const pendingApprovals = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.orgId, orgId), eq(approvals.status, 'pending')))
    .orderBy(asc(approvals.createdAt))
    .limit(10);
  const aging = pendingApprovals.filter((a) => isAging(a.createdAt, now));

  const [goalsActiveRow] = await db
    .select({ n: count() })
    .from(goals)
    .where(and(eq(goals.orgId, orgId), eq(goals.status, 'active')));
  const overdueGoals = await db
    .select()
    .from(goals)
    .where(
      and(
        eq(goals.orgId, orgId),
        eq(goals.status, 'active'),
        sql`${goals.dueDate} IS NOT NULL AND ${goals.dueDate} < ${now}`,
      ),
    )
    .limit(5);

  const [outcomesRow] = await db
    .select({ n: count() })
    .from(connectorOutcomes)
    .where(and(eq(connectorOutcomes.orgId, orgId), gte(connectorOutcomes.createdAt, since)));
  const [eventsRow] = await db
    .select({ n: count() })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.orgId, orgId), gte(webhookEvents.receivedAt, since)));

  const [pausedRow] = await db
    .select({ n: count() })
    .from(agents)
    .where(and(eq(agents.orgId, orgId), eq(agents.status, 'paused')));

  const recentActivity = await db
    .select()
    .from(activityEvents)
    .where(and(eq(activityEvents.orgId, orgId), gte(activityEvents.occurredAt, since)))
    .orderBy(desc(activityEvents.occurredAt))
    .limit(10);

  const failedTasks = await db
    .select()
    .from(tasks)
    .where(and(...conditions, eq(tasks.status, 'failed')))
    .limit(10);

  const stats: BriefingContent['stats'] = {
    tasksCompleted: completedRow?.n ?? 0,
    tasksFailed: failedRow?.n ?? 0,
    approvalsPending: pendingRow?.n ?? 0,
    approvalsAging: aging.length,
    goalsActive: goalsActiveRow?.n ?? 0,
    goalsOverdue: overdueGoals.length,
    connectorOutcomes: outcomesRow?.n ?? 0,
    webhookEvents: eventsRow?.n ?? 0,
    agentsPaused: Number(pausedRow?.n ?? 0),
  };

  const sections: BriefingSection[] = [];

  // Overnight activity
  const activityItems = recentActivity.map((a) => `${a.summary}${a.reason ? ` (because: ${a.reason})` : ''}`);
  if (activityItems.length > 0) {
    sections.push({ heading: 'Activity', items: activityItems });
  }

  // Task outcomes
  const taskItems: string[] = [];
  if (stats.tasksCompleted > 0) taskItems.push(`${stats.tasksCompleted} task(s) completed`);
  if (stats.tasksFailed > 0) taskItems.push(`${stats.tasksFailed} task(s) failed`);
  for (const t of failedTasks.slice(0, 5)) taskItems.push(`Failed: "${t.title}"`);
  if (taskItems.length > 0) {
    sections.push({ heading: 'Tasks', items: taskItems });
  }

  // Pending approvals
  if (pendingApprovals.length > 0) {
    sections.push({
      heading: 'Needs Your Approval',
      items: pendingApprovals.map(
        (a) => `${a.description}${isAging(a.createdAt, now) ? ' (aging)' : ''}`,
      ),
    });
  }

  // Goals
  const goalItems: string[] = [];
  if (stats.goalsActive > 0) goalItems.push(`${stats.goalsActive} active goal(s)`);
  for (const g of overdueGoals) goalItems.push(`Overdue: "${g.title}"`);
  if (goalItems.length > 0) sections.push({ heading: 'Goals', items: goalItems });

  // Anomalies — period signals plus a live scan of goal/task/failure/spend
  // thresholds (anomaly-detector.ts). The scan is deterministic and bounded,
  // and gives the founder proactive warnings about stalls, at-risk goals,
  // blocked tasks, failure spikes and spend spikes.
  const anomalies: string[] = [];
  if (stats.tasksFailed >= 2) anomalies.push(`${stats.tasksFailed} task failures this period — review agent reliability.`);
  if (aging.length > 0) anomalies.push(`${aging.length} approval(s) waiting over 24h.`);
  if (stats.goalsOverdue > 0) anomalies.push(`${stats.goalsOverdue} overdue goal(s).`);
  if (stats.agentsPaused > 0) anomalies.push(`${stats.agentsPaused} AI employee(s) paused.`);
  if (stats.connectorOutcomes > 20) anomalies.push(`Unusually high connector activity (${stats.connectorOutcomes} outcomes).`);
  try {
    const scan = await scanOrgAnomalies(db, orgId, now);
    for (const a of scan.anomalies) {
      anomalies.push(`${a.severity === 'critical' ? '[CRITICAL] ' : a.severity === 'warning' ? '[WARNING] ' : ''}${a.message}`);
    }
  } catch {
    // The scan must never take down the briefing — fall back to period signals only.
  }
  if (anomalies.length > 0) sections.push({ heading: 'Needs Attention', items: anomalies });

  const quiet =
    isQuietContent(stats) && activityItems.length === 0 && anomalies.length === 0;

  return {
    quiet,
    periodStart: since.toISOString(),
    periodEnd: until.toISOString(),
    sections,
    stats,
  };
}

/**
 * Build the real "Trends & Spend" section for a period, comparing the current
 * window against the equal-length window immediately before it. Every figure
 * is computed from the operational tables — task completions/failures, agent
 * activity, connector outcomes, and actual credit usage (type = usage).
 * Returns null when the org had no measurable activity in either window.
 */
export async function buildTrendSection(
  db: Db,
  orgId: string,
  since: Date,
  until: Date,
  now = new Date(),
): Promise<BriefingSection | null> {
  const windowMs = until.getTime() - since.getTime();
  const prevUntil = new Date(since.getTime());
  const prevSince = new Date(since.getTime() - windowMs);

  const countWindow = async (from: Date, to: Date, status: string) => {
    const [row] = await db
      .select({ n: count() })
      .from(tasks)
      .where(and(eq(tasks.orgId, orgId), eq(tasks.status, status), gte(tasks.updatedAt, from), lt(tasks.updatedAt, to)));
    return row?.n ?? 0;
  };

  const activityWindow = async (from: Date, to: Date) => {
    const [row] = await db
      .select({ n: count() })
      .from(activityEvents)
      .where(and(eq(activityEvents.orgId, orgId), gte(activityEvents.occurredAt, from), lt(activityEvents.occurredAt, to)));
    return row?.n ?? 0;
  };

  const outcomesWindow = async (from: Date, to: Date) => {
    const [row] = await db
      .select({ n: count() })
      .from(connectorOutcomes)
      .where(and(eq(connectorOutcomes.orgId, orgId), gte(connectorOutcomes.createdAt, from), lt(connectorOutcomes.createdAt, to)));
    return row?.n ?? 0;
  };

  const usageWindow = async (from: Date, to: Date) => {
    const [row] = await db
      .select({ total: sql<number>`coalesce(abs(sum(${creditTransactions.amount})), 0)::int` })
      .from(creditTransactions)
      .where(and(
        eq(creditTransactions.orgId, orgId),
        eq(creditTransactions.type, 'usage'),
        gte(creditTransactions.createdAt, from),
        lt(creditTransactions.createdAt, to),
      ));
    return row?.total ?? 0;
  };

  const [completed, completedPrev, failed, failedPrev, activity, activityPrev, outcomes, outcomesPrev, spend, spendPrev] = await Promise.all([
    countWindow(since, until, 'completed'),
    countWindow(prevSince, prevUntil, 'completed'),
    countWindow(since, until, 'failed'),
    countWindow(prevSince, prevUntil, 'failed'),
    activityWindow(since, until),
    activityWindow(prevSince, prevUntil),
    outcomesWindow(since, until),
    outcomesWindow(prevSince, prevUntil),
    usageWindow(since, until),
    usageWindow(prevSince, prevUntil),
  ]);

  const items: string[] = [];
  const push = (heading: string, current: number, previous: number) => {
    const delta = periodDeltaLabel(current, previous);
    if (delta) items.push(`${heading}: ${delta}.`);
  };

  push('Tasks completed', completed, completedPrev);
  push('Tasks failed', failed, failedPrev);
  push('AI employee actions', activity, activityPrev);
  push('Connector actions', outcomes, outcomesPrev);
  if (spend > 0 || spendPrev > 0) {
    items.push(`Work credits used: ${spend}${spendPrev > 0 ? ` (${Math.round(((spend - spendPrev) / spendPrev) * 100) > 0 ? '+' : ''}${Math.round(((spend - spendPrev) / spendPrev) * 100)}% vs previous)` : ' (new)'}.`);
  }

  if (items.length === 0) return null;
  return { heading: 'Trends & Spend', items };
}

/** Pure: whether the org had meaningful activity worth a briefing. */
export function isQuietContent(stats: BriefingContent['stats']): boolean {
  return (
    stats.tasksCompleted === 0 &&
    stats.tasksFailed === 0 &&
    stats.approvalsPending === 0 &&
    stats.goalsActive === 0 &&
    stats.connectorOutcomes === 0 &&
    stats.webhookEvents === 0
  );
}

function briefingEmailHtml(orgName: string, label: string, content: BriefingContent): string {
  const parts = content.sections
    .map(
      (s) => `<h3 style="margin:18px 0 6px;font-size:13px;color:#0a1024;">${s.heading}</h3>
        <ul style="margin:0;padding-left:18px;color:#1c2540;font-size:14px;line-height:1.5;">${s.items
          .map((i) => `<li>${i.replace(/</g, '&lt;')}</li>`)
          .join('')}</ul>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8" /></head>
<body style="margin:0;background:#f7f8fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
  <div style="background:#0a1024;padding:20px 28px;border-radius:12px 12px 0 0;">
    <span style="color:#b6e63d;font-weight:700;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;">${label.toLowerCase()} briefing · ${orgName}</span>
  </div>
  <div style="background:#ffffff;padding:28px;border:1px solid #e4e7ef;border-top:none;border-radius:0 0 12px 12px;">
    ${content.quiet ? '<p style="color:#5b6478;">No significant activity in this period.</p>' : parts}
  </div>
</div></body></html>`;
}

async function orgNameAndOwnerEmail(
  db: Db,
  orgId: string,
): Promise<{ orgName: string; ownerEmail: string | null }> {
  const [orgRow] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const rows = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.role, 'owner')))
    .limit(1);
  return { orgName: orgRow?.name ?? 'ORQ8', ownerEmail: rows[0]?.email ?? null };
}

/**
 * Generate + deliver a briefing for one org for one deterministic period.
 * Idempotent (per org + kind + periodStart, enforced by the DB unique index);
 * never throws on delivery failures. Used for daily, weekly and monthly runs.
 */
export async function generateBriefing(
  db: Db,
  config: AppConfig,
  logger: Logger,
  orgId: string,
  kind: BriefingKind,
  now = new Date(),
): Promise<Briefing | null> {
  const { periodStart, periodEnd, label } = periodFor(kind, now);

  const [existing] = await db
    .select()
    .from(briefings)
    .where(
      and(
        eq(briefings.orgId, orgId),
        eq(briefings.kind, kind),
        eq(briefings.periodStart, periodStart),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const content = await buildBriefingContent(db, orgId, periodStart, periodEnd, now);
  const trend = await buildTrendSection(db, orgId, periodStart, periodEnd, now);
  if (trend) content.sections.push(trend);

  const rows = await db
    .insert(briefings)
    .values({
      orgId,
      kind,
      periodStart,
      periodEnd,
      content: content as never,
      status: 'generated',
    })
    .returning();
  const briefing = rows[0];
  if (!briefing) return null;

  await appendAudit(db, {
    orgId,
    actorType: 'system',
    action: 'briefing.generated',
    outcome: 'success',
    inputRef: briefing.id,
  });

  // Delivery — skip when the org had no meaningful activity.
  if (content.quiet) return briefing;

  await createNotification(
    db,
    orgId,
    'system',
    `${label} Briefing`,
    content.sections.length > 0
      ? `${content.sections[0]!.heading}: ${content.sections[0]!.items.slice(0, 2).join(' · ')}`
      : 'No significant activity in this period.',
  );

  try {
    const prefs = await getNotificationPrefs(db, orgId);
    const { orgName, ownerEmail } = await orgNameAndOwnerEmail(db, orgId);
    if (prefs.emailOnWeeklyReport && ownerEmail) {
      const transport = createEmailTransport(config, logger);
      await transport.send({
        to: ownerEmail,
        subject: `[ORQ8] ${label} Briefing — ${orgName}`,
        text: content.sections
          .map((s) => `${s.heading}\n${s.items.map((i) => ` · ${i}`).join('\n')}`)
          .join('\n\n'),
        html: briefingEmailHtml(orgName, label, content),
      });
    }
  } catch (err) {
    logger.warn({ err, orgId }, `briefing delivery (email) failed for ${kind} — in-app notification already created`);
  }

  await db
    .update(briefings)
    .set({ status: 'delivered', deliveredAt: new Date() })
    .where(eq(briefings.id, briefing.id));
  return { ...briefing, status: 'delivered' as const };
}

/** Daily convenience wrapper (kept for existing callers/tests). */
export async function generateDailyBriefing(
  db: Db,
  config: AppConfig,
  logger: Logger,
  orgId: string,
  now = new Date(),
): Promise<Briefing | null> {
  return generateBriefing(db, config, logger, orgId, 'daily', now);
}

/** Weekly briefing for one org (Monday → Sunday, UTC). */
export async function generateWeeklyBriefing(
  db: Db,
  config: AppConfig,
  logger: Logger,
  orgId: string,
  now = new Date(),
): Promise<Briefing | null> {
  return generateBriefing(db, config, logger, orgId, 'weekly', now);
}

/** Monthly briefing for one org (calendar month, UTC). */
export async function generateMonthlyBriefing(
  db: Db,
  config: AppConfig,
  logger: Logger,
  orgId: string,
  now = new Date(),
): Promise<Briefing | null> {
  return generateBriefing(db, config, logger, orgId, 'monthly', now);
}

/** Distinct orgs with any activity in the period (bounded). */
export async function orgIdsWithActivity(
  db: Db,
  since: Date,
  limit = 200,
): Promise<string[]> {
  const taskOrgs = await db
    .selectDistinct({ orgId: tasks.orgId })
    .from(tasks)
    .where(gte(tasks.updatedAt, since))
    .limit(limit);
  const approvalOrgs = await db
    .selectDistinct({ orgId: approvals.orgId })
    .from(approvals)
    .where(gte(approvals.createdAt, since))
    .limit(limit);
  const eventOrgs = await db
    .selectDistinct({ orgId: webhookEvents.orgId })
    .from(webhookEvents)
    .where(gte(webhookEvents.receivedAt, since))
    .limit(limit);

  return [
    ...new Set([
      ...taskOrgs.map((r) => r.orgId),
      ...approvalOrgs.map((r) => r.orgId),
      ...eventOrgs.map((r) => r.orgId),
    ]),
  ];
}

/** Run briefings of one kind for every org with activity in its period. */
export async function runBriefings(
  db: Db,
  config: AppConfig,
  logger: Logger,
  kind: BriefingKind,
  now = new Date(),
): Promise<Array<{ orgId: string; briefingId?: string; skipped: boolean }>> {
  const { periodStart } = periodFor(kind, now);
  const orgIds = await orgIdsWithActivity(db, periodStart);
  const out: Array<{ orgId: string; briefingId?: string; skipped: boolean }> = [];
  for (const orgId of orgIds) {
    try {
      const briefing = await generateBriefing(db, config, logger, orgId, kind, now);
      if (!briefing) {
        out.push({ orgId, skipped: true });
      } else {
        out.push({ orgId, briefingId: briefing.id, skipped: false });
      }
    } catch (err) {
      logger.warn({ err, orgId }, `${kind} briefing failed for org`);
      out.push({ orgId, skipped: true });
    }
  }
  return out;
}

/** Daily convenience wrapper for existing internal callers. */
export async function runDailyBriefings(
  db: Db,
  config: AppConfig,
  logger: Logger,
  now = new Date(),
): Promise<Array<{ orgId: string; briefingId?: string; skipped: boolean }>> {
  return runBriefings(db, config, logger, 'daily', now);
}