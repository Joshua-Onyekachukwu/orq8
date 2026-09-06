import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { getEntitlements } from '../services/entitlements.js';
import type { AppDeps } from '../types.js';

/**
 * GET /v1/entitlements — the org's plan entitlements with live usage:
 * agents, departments, teams, connectors and MCP servers (used / limit /
 * remaining / reached). Same source powers UI display and server-side
 * enforcement — no scattered plan logic.
 */
export function registerEntitlementRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.get('/v1/entitlements', async (request) => {
    const ctx = await requireAuth(request, deps);
    const entitlements = await getEntitlements(db, ctx.orgId);
    return { data: entitlements };
  });
}
