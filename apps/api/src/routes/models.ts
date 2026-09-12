/**
 * Model performance routes (§7 / §32).
 *
 * GET /v1/models — per-model statistics + cost-optimization insights derived
 * from the structured per-call history in `llm_performance`. Every number is
 * measured; thin data returns explicit `insufficient_data` entries rather than
 * fabricated performance. Read-only; org-scoped via requireAuth.
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { getModelStats, getCostOptimizationInsights } from '../services/model-insights.js';
import type { AppDeps } from '../types.js';

export function registerModelRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** GET /v1/models — measured model stats (rolling 30d) + honest insights. */
  app.get('/v1/models', async (request) => {
    const ctx = await requireAuth(request, deps);
    const [stats, insights] = await Promise.all([
      getModelStats(db, ctx.orgId),
      getCostOptimizationInsights(db, ctx.orgId),
    ]);
    return { data: { stats, insights } };
  });
}
