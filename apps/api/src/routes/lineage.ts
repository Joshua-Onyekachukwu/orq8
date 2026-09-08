/**
 * ORQ8 Strategic Lineage Routes
 *
 * GET /v1/lineage/tree    — Full strategic tree from strategies down
 * GET /v1/lineage/score   — Lineage score (% of tasks traced to strategy)
 * GET /v1/lineage/task/:id — Trace a single task's lineage
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { buildStrategicTree, calculateLineageScore, traceTaskLineage } from '../services/lineage.js';
import type { AppDeps } from '../types.js';

export function registerLineageRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** GET /v1/lineage/tree — Full strategic tree */
  app.get('/v1/lineage/tree', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const tree = await buildStrategicTree(db, ctx.orgId);
    return { tree };
  });

  /** GET /v1/lineage/score — Lineage score */
  app.get('/v1/lineage/score', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    return calculateLineageScore(db, ctx.orgId);
  });

  /** GET /v1/lineage/task/:id — Trace a single task's lineage */
  app.get('/v1/lineage/task/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { id } = request.params as { id: string };
    const lineage = await traceTaskLineage(db, ctx.orgId, id);
    if (!lineage) { reply.code(404); return { error: { code: 'not_found', message: 'Task not found' } }; }
    return lineage;
  });
}
