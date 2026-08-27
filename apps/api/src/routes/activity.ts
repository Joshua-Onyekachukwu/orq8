import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import * as activity from '../services/activity.js';
import * as agents from '../services/agents.js';
import * as approvals from '../services/approvals.js';
import type { AppDeps } from '../types.js';

export function registerActivityRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** List activity events for the current org. */
  app.get('/v1/activity', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const agentId = url.searchParams.get('agent_id') ?? undefined;
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
    const list = await activity.findByOrg(db, ctx.orgId, { agentId, limit });
    return { data: list };
  });

  /** Dashboard summary stats for the current org. */
  app.get('/v1/dashboard', async (request) => {
    const ctx = await requireAuth(request, deps);

    const [activeAgents, pendingApprovals, recentActivity] = await Promise.all([
      agents.countActive(db, ctx.orgId),
      approvals.countPending(db, ctx.orgId),
      activity.findByOrg(db, ctx.orgId, { limit: 10 }),
    ]);

    // Calculate weekly spend from recent activity
    const weeklySpend = recentActivity.reduce((sum, e) => sum + (e.cost ?? 0), 0);

    return {
      data: {
        active_agents: activeAgents,
        pending_approvals: pendingApprovals,
        weekly_spend: weeklySpend / 100, // convert cents to dollars
        recent_activity: recentActivity,
      },
    };
  });
}
