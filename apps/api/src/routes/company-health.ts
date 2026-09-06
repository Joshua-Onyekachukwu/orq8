import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { getCompanyHealth } from '../services/company-health.js';
import type { AppDeps } from '../types.js';

/**
 * ORQ8 Company Health API
 *
 * GET /v1/health — deterministic composite operational score for the current
 * org, with per-factor scores and explainable reasons. Org-scoped server-side;
 * identical org state always yields the identical score.
 */
export function registerCompanyHealthRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.get('/v1/health', async (request) => {
    const ctx = await requireAuth(request, deps);
    const health = await getCompanyHealth(db, ctx.orgId);
    return { data: health };
  });
}