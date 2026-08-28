import { eq, and, gte, sql } from 'drizzle-orm';
import { goals, tasks, activityEvents } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import * as activity from '../services/activity.js';
import * as agents from '../services/agents.js';
import * as approvals from '../services/approvals.js';
import * as credits from '../services/credits.js';
import type { AppDeps } from '../types.js';

export function registerActivityRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** List activity events for the current org. */
  app.get('/v1/activity', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const agentId = url.searchParams.get('agent_id') ?? undefined;
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10), 0);
    const list = await activity.findByOrg(db, ctx.orgId, { agentId, limit, offset });
    return { data: list, meta: { limit, offset } };
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
