/**
 * Founder's Attention API (docs/61 Phase 3).
 *
 * GET /v1/attention — the founder's queue in one call: pending approvals and
 * tool permission requests, blocked critical work, failures needing review,
 * unacknowledged credit alerts, goal deadline risk and council escalations,
 * ordered by severity then source.
 *
 * Org scoping comes from the session context only; the request cannot widen it.
 * The response carries the item list, counts by severity and source, and an
 * honest `quiet` flag when nothing needs the founder.
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { collectAttention } from '../services/attention.js';
import type { AppDeps } from '../types.js';

export function registerAttentionRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.get('/v1/attention', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const requested = parseInt(url.searchParams.get('limit') ?? '50', 10);
    const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 50, 1), 200);

    const result = await collectAttention(db, ctx.orgId, {
      eaName: deps.config.EA_DISPLAY_NAME,
      limits: { total: limit },
    });

    return { data: result };
  });
}
