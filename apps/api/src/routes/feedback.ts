import { z } from 'zod';
import { validation } from '@orq8/core';
import { eq, and, desc, sql } from 'drizzle-orm';
import { companyMemory, activityEvents, agents, type Db } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import type { AppDeps } from '../types.js';

const submitFeedbackBody = z.object({
  agentId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  feedbackType: z.enum(['completion', 'blocker', 'question', 'recommendation', 'escalation']),
  summary: z.string().trim().min(1).max(500),
  details: z.string().max(2000).optional(),
  suggestedAction: z.string().max(500).optional(),
  requiresFounderAttention: z.boolean().default(false),
});

export function registerFeedbackRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /**
   * POST /v1/feedback — Submit feedback from an agent.
   */
  app.post('/v1/feedback', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = submitFeedbackBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const { submitFeedback } = await import('../services/multi-agent.js');
    const result = await submitFeedback(db, {
      orgId: ctx.orgId,
      ...parsed.data,
    });

    reply.code(201);
    return { data: result };
  });

  /**
   * GET /v1/feedback — Get all feedback for an organization.
   */
  app.get('/v1/feedback', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
    const type = url.searchParams.get('type');

    // Get feedback from company memory (stored by submitFeedback)
    const conditions = [
      eq(companyMemory.orgId, ctx.orgId),
      sql`${companyMemory.category} IN ('lesson', 'context')`,
      sql`${companyMemory.content} LIKE '[%' OR ${companyMemory.source} = 'agent_memory'`,
    ];

    if (type) {
      conditions.push(sql`${companyMemory.content} LIKE ${`[${type.toUpperCase()}%`}`);
    }

    const entries = await db
      .select({
        id: companyMemory.id,
        content: companyMemory.content,
        category: companyMemory.category,
        importance: companyMemory.importance,
        source: companyMemory.source,
        agentId: companyMemory.agentId,
        taskId: companyMemory.taskId,
        createdAt: companyMemory.createdAt,
      })
      .from(companyMemory)
      .where(and(...conditions))
      .orderBy(desc(companyMemory.createdAt))
      .limit(limit);

    // Get agent names for the feedback
    const agentIds = [...new Set(entries.map(e => e.agentId).filter(Boolean))] as string[];
    const agentMap = new Map<string, { name: string; role: string }>();
    if (agentIds.length > 0) {
      const agentRows = await db
        .select({ id: agents.id, name: agents.name, role: agents.role })
        .from(agents)
        .where(eq(agents.orgId, ctx.orgId));
      for (const a of agentRows) {
        agentMap.set(a.id, { name: a.name, role: a.role });
      }
    }

    // Parse feedback type from content prefix
    const feedback = entries.map(e => {
      const typeMatch = e.content.match(/^\[([A-Z_]+)\]/);
      const feedbackType = typeMatch?.[1]?.toLowerCase() ?? 'unknown';
      const cleanContent = e.content.replace(/^\[[A-Z_]+\]\s*/, '');

      return {
        id: String(e.id),
        feedbackType,
        summary: cleanContent.split('\n')[0] ?? cleanContent,
        details: cleanContent.split('\n').slice(1).join('\n').trim() || null,
        importance: e.importance,
        agentId: e.agentId,
        agentName: e.agentId ? agentMap.get(e.agentId)?.name ?? 'Unknown' : 'System',
        agentRole: e.agentId ? agentMap.get(e.agentId)?.role ?? 'unknown' : 'system',
        taskId: e.taskId,
        createdAt: e.createdAt,
      };
    });

    return { data: feedback };
  });

  /**
   * GET /v1/feedback/stats — Get feedback statistics.
   */
  app.get('/v1/feedback/stats', async (request) => {
    const ctx = await requireAuth(request, deps);

    // Count feedback by type from activity events
    const feedbackEvents = await db
      .select({
        type: activityEvents.type,
        count: sql<number>`count(*)::int`,
      })
      .from(activityEvents)
      .where(and(
        eq(activityEvents.orgId, ctx.orgId),
        sql`${activityEvents.type} IN ('completion', 'blocker', 'question', 'recommendation', 'escalation')`,
      ))
      .groupBy(activityEvents.type)
      .catch(() => []);

    // Count pending escalations/blockers
    const pendingEscalations = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(companyMemory)
      .where(and(
        eq(companyMemory.orgId, ctx.orgId),
        sql`${companyMemory.content} LIKE '%Escalation%' OR ${companyMemory.content} LIKE '%Blocker%'`,
        sql`${companyMemory.importance} >= 7`,
      ))
      .catch(() => [{ count: 0 }]);

    // Recent feedback (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentFeedback = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(companyMemory)
      .where(and(
        eq(companyMemory.orgId, ctx.orgId),
        sql`${companyMemory.createdAt} >= ${oneDayAgo}`,
        sql`${companyMemory.content} LIKE '[%'`,
      ))
      .catch(() => [{ count: 0 }]);

    return {
      data: {
        byType: feedbackEvents.reduce((acc, e) => ({ ...acc, [e.type]: e.count }), {}),
        pendingEscalations: pendingEscalations[0]?.count ?? 0,
        recentFeedback: recentFeedback[0]?.count ?? 0,
      },
    };
  });
}
