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

/** UTC-midnight start of the day containing `now`. */
export function dayStart(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
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

  // Anomalies
  const anomalies: string[] = [];
  if (stats.tasksFailed >= 2) anomalies.push(`${stats.tasksFailed} task failures this period — review agent reliability.`);
  if (aging.length > 0) anomalies.push(`${aging.length} approval(s) waiting over 24h.`);
  if (stats.goalsOverdue > 0) anomalies.push(`${stats.goalsOverdue} overdue goal(s).`);
  if (stats.agentsPaused > 0) anomalies.push(`${stats.agentsPaused} AI employee(s) paused.`);
  if (stats.connectorOutcomes > 20) anomalies.push(`Unusually high connector activity (${stats.connectorOutcomes} outcomes).`);
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

function briefingEmailHtml(orgName: string, content: BriefingContent): string {
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
    <span style="color:#b6e63d;font-weight:700;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;">daily briefing · ${orgName}</span>
  </div>
  <div style="background:#ffffff;padding:28px;border:1px solid #e4e7ef;border-top:none;border-radius:0 0 12px 12px;">
    ${content.quiet ? '<p style="color:#5b6478;">No significant activity since the last briefing.</p>' : parts}
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
 * Generate + deliver the daily briefing for one org. Idempotent: returns the
 * existing row when this org+period already has one. Never throws on delivery
 * failures (the briefing row is still recorded).
 */
export async function generateDailyBriefing(
  db: Db,
  config: AppConfig,
  logger: Logger,
  orgId: string,
  now = new Date(),
): Promise<Briefing | null> {
  const periodStart = dayStart(now);
  const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);

  const [existing] = await db
    .select()
    .from(briefings)
    .where(
      and(
        eq(briefings.orgId, orgId),
        eq(briefings.kind, 'daily'),
        eq(briefings.periodStart, periodStart),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const content = await buildBriefingContent(db, orgId, periodStart, periodEnd, now);

  const rows = await db
    .insert(briefings)
    .values({
      orgId,
      kind: 'daily',
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
    'Daily Briefing',
    content.sections.length > 0
      ? `${content.sections[0]!.heading}: ${content.sections[0]!.items.slice(0, 2).join(' · ')}`
      : 'No significant activity since the last briefing.',
  );

  try {
    const prefs = await getNotificationPrefs(db, orgId);
    const { orgName, ownerEmail } = await orgNameAndOwnerEmail(db, orgId);
    if (prefs.emailOnWeeklyReport && ownerEmail) {
      const transport = createEmailTransport(config, logger);
      await transport.send({
        to: ownerEmail,
        subject: `[ORQ8] Daily Briefing — ${orgName}`,
        text: content.sections
          .map((s) => `${s.heading}\n${s.items.map((i) => ` · ${i}`).join('\n')}`)
          .join('\n\n'),
        html: briefingEmailHtml(orgName, content),
      });
    }
  } catch (err) {
    logger.warn({ err, orgId }, 'briefing delivery (email) failed — in-app notification already created');
  }

  await db
    .update(briefings)
    .set({ status: 'delivered', deliveredAt: new Date() })
    .where(eq(briefings.id, briefing.id));
  return { ...briefing, status: 'delivered' as const };
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

/** Run the daily briefing for every org with activity since the period start. */
export async function runDailyBriefings(
  db: Db,
  config: AppConfig,
  logger: Logger,
  now = new Date(),
): Promise<Array<{ orgId: string; briefingId?: string; skipped: boolean }>> {
  const since = dayStart(now);
  const orgIds = await orgIdsWithActivity(db, since);
  const out: Array<{ orgId: string; briefingId?: string; skipped: boolean }> = [];
  for (const orgId of orgIds) {
    try {
      const briefing = await generateDailyBriefing(db, config, logger, orgId, now);
      if (!briefing) {
        out.push({ orgId, skipped: true });
      } else {
        out.push({ orgId, briefingId: briefing.id, skipped: false });
      }
    } catch (err) {
      logger.warn({ err, orgId }, 'daily briefing failed for org');
      out.push({ orgId, skipped: true });
    }
  }
  return out;
}