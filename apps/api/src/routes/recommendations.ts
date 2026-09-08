import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import type { AppDeps } from '../types.js';
import * as recommendation from '../services/agent-recommendation.js';

export function registerRecommendationRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /**
   * POST /v1/recommendations/agents — "Who should handle this?"
   * Given a task description, recommend the best agents.
   */
  app.post('/v1/recommendations/agents', async (request) => {
    const ctx = await requireAuth(request, deps);
    const body = z.object({
      taskDescription: z.string().min(1).max(2000).trim(),
      limit: z.number().int().min(1).max(20).optional().default(5),
    }).safeParse(request.body);
    if (!body.success) throw new Error(JSON.stringify(body.error.flatten()));

    const agents = await recommendation.recommendAgents(
      db,
      ctx.orgId,
      body.data.taskDescription,
      body.data.limit,
    );

    return { data: agents };
  });

  /**
   * GET /v1/recommendations/priorities — "What should I do next?"
   * Returns prioritized actions based on current company state.
   */
  app.get('/v1/recommendations/priorities', async (request) => {
    const ctx = await requireAuth(request, deps);
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(20).optional().default(10),
    }).safeParse(request.query);
    if (!query.success) throw new Error(JSON.stringify(query.error.flatten()));

    const actions = await recommendation.recommendPriorities(
      db,
      ctx.orgId,
      query.data.limit,
    );

    return { data: actions };
  });

  /**
   * GET /v1/recommendations/workforce-intelligence — workforce summary for EA context
   */
  app.get('/v1/recommendations/workforce-intelligence', async (request) => {
    const ctx = await requireAuth(request, deps);
    const intelligence = await recommendation.getWorkforceIntelligence(db, ctx.orgId);
    return { data: { summary: intelligence } };
  });
}
