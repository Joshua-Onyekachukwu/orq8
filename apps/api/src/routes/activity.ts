import { eq, and, gte, sql } from 'drizzle-orm';
import { goals, tasks, activityEvents, type Db } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import * as activity from '../services/activity.js';
import * as agents from '../services/agents.js';
import * as approvals from '../services/approvals.js';
import * as credits from '../services/credits.js';
import type { AppDeps } from '../types.js';

export function registerActivityRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** Export activity events as CSV. */
  app.get('/v1/activity/export', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const format = url.searchParams.get('format') ?? 'csv';
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '1000', 10), 5000);
    const list = await activity.findByOrg(db, ctx.orgId, { limit, offset: 0 });

    if (format === 'json') {
      reply.header('Content-Type', 'application/json');
      reply.header('Content-Disposition', `attachment; filename="orq8-audit-${new Date().toISOString().slice(0, 10)}.json"`);
      return { data: list };
    }

    // CSV format
    const header = 'id,type,summary,reason,agent_id,task_id,cost,department,occurred_at';
    const rows = list.map((e) => [
      e.id,
      e.type,
      `"${(e.summary ?? '').replace(/"/g, '""')}"`,
      `"${(e.reason ?? '').replace(/"/g, '""')}"`,
      e.agentId ?? '',
      e.taskId ?? '',
      (e.cost / 100).toFixed(2),
      e.department ?? '',
      e.occurredAt instanceof Date ? e.occurredAt.toISOString() : String(e.occurredAt),
    ].join(','));
    const csv = [header, ...rows].join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="orq8-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
    return csv;
  });

  /** List activity events for the current org. */
  app.get('/v1/activity', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const agentId = url.searchParams.get('agent_id') ?? undefined;
    const taskId = url.searchParams.get('task_id') ?? undefined;
    const taskIds = url.searchParams.get('task_ids')?.split(',').filter(Boolean);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10), 0);
    const conditions = [eq(activityEvents.orgId, ctx.orgId)];
    if (agentId) conditions.push(eq(activityEvents.agentId, agentId));
    if (taskId) conditions.push(eq(activityEvents.taskId, taskId));
    if (taskIds && taskIds.length > 0) conditions.push(sql`${activityEvents.taskId} IN (${sql.join(taskIds.map(id => sql`${id}`), sql`, `)})`);
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(activityEvents)
      .where(and(...conditions));
    const list = await db
      .select()
      .from(activityEvents)
      .where(and(...conditions))
      .orderBy(sql`${activityEvents.occurredAt} DESC`)
      .limit(limit)
      .offset(offset);
    return { data: list, meta: { limit, offset, total: totalRow?.count ?? 0 } };
  });

  /** Dashboard summary stats for the current org. */
  app.get('/v1/dashboard', async (request) => {
    const ctx = await requireAuth(request, deps);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [activeAgents, pendingApprovals, recentActivity, creditBalance, totalGoals, activeGoals, totalTasks, completedTasks] = await Promise.all([
      agents.countActive(db, ctx.orgId),
      approvals.countPending(db, ctx.orgId),
      activity.findByOrg(db, ctx.orgId, { limit: 10 }),
      credits.getOrCreateBalance(db, ctx.orgId),
      db.select({ count: sql<number>`count(*)::int` }).from(goals).where(eq(goals.orgId, ctx.orgId)),
      db.select({ count: sql<number>`count(*)::int` }).from(goals).where(and(eq(goals.orgId, ctx.orgId), eq(goals.status, 'active'))),
      db.select({ count: sql<number>`count(*)::int` }).from(tasks).where(eq(tasks.orgId, ctx.orgId)),
      db.select({ count: sql<number>`count(*)::int` }).from(tasks).where(and(eq(tasks.orgId, ctx.orgId), eq(tasks.status, 'completed'))),
    ]);

    // Calculate actual weekly spend from this week's activity events
    const [weeklyResult] = await db
      .select({ total: sql<number>`coalesce(sum(${activityEvents.cost}), 0)::int` })
      .from(activityEvents)
      .where(and(eq(activityEvents.orgId, ctx.orgId), gte(activityEvents.occurredAt, weekAgo)));

    const weeklySpend = (weeklyResult?.total ?? 0) / 100; // convert cents to dollars

    return {
      data: {
        active_agents: activeAgents,
        pending_approvals: pendingApprovals,
        total_goals: totalGoals[0]?.count ?? 0,
        active_goals: activeGoals[0]?.count ?? 0,
        total_tasks: totalTasks[0]?.count ?? 0,
        completed_tasks: completedTasks[0]?.count ?? 0,
        weekly_spend: weeklySpend,
        credits: {
          total: creditBalance.total,
          used: creditBalance.used,
          remaining: creditBalance.remaining,
          utilizationPercent: creditBalance.utilizationPercent,
          isLow: creditBalance.isLow,
          isCritical: creditBalance.isCritical,
          daysRemaining: creditBalance.daysRemaining,
        },
        recent_activity: recentActivity,
      },
    };
  });
}
