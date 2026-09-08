/**
 * ORQ8 Strategy Routes — Strategy → Objective → Key Result chain
 *
 * Provides CRUD for strategies, objectives, key results, and initiatives.
 * All operations are org-scoped and audited.
 */

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import {
  createStrategy, listStrategies, getStrategy, updateStrategy,
  createObjective, listObjectives, getObjective, updateObjective,
  createKeyResult, listKeyResults, updateKeyResult,
  createInitiative, listInitiatives,
  getStrategySummary,
} from '../services/strategy.js';
import type { AppDeps } from '../types.js';

// ── Zod Schemas ─────────────────────────────────────────────────────────────

const createStrategyBody = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(5000).optional(),
  status: z.enum(['draft', 'active', 'completed', 'archived']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  timeHorizon: z.string().max(50).optional(),
  startDate: z.string().datetime().optional(),
  targetDate: z.string().datetime().optional(),
});

const updateStrategyBody = createStrategyBody.partial();

const createObjectiveBody = z.object({
  strategyId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(5000).optional(),
  status: z.enum(['draft', 'active', 'completed', 'archived']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  ownerAgentId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  targetDate: z.string().datetime().optional(),
});

const updateObjectiveBody = createObjectiveBody.partial().omit({ strategyId: true });

const createKRBody = z.object({
  objectiveId: z.string().uuid(),
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(5000).optional(),
  metricType: z.enum(['numeric', 'boolean', 'milestone']).optional(),
  metricStart: z.number().optional(),
  metricTarget: z.number().optional(),
  metricCurrent: z.number().optional(),
  unit: z.string().max(50).optional(),
});

const updateKRBody = createKRBody.partial().omit({ objectiveId: true });

const createInitiativeBody = z.object({
  strategyId: z.string().uuid().optional(),
  objectiveId: z.string().uuid().optional(),
  keyResultId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(5000).optional(),
  status: z.enum(['proposed', 'active', 'completed', 'paused', 'archived']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  ownerAgentId: z.string().uuid().optional(),
  estimatedHours: z.number().optional(),
});

export function registerStrategyRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  // ── Strategies ──────────────────────────────────────────────────────────

  app.post('/v1/strategies', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const body = createStrategyBody.parse(request.body);
    const strategy = await createStrategy(db, ctx.orgId, ctx.userId, body as any);
    reply.code(201);
    return strategy;
  });

  app.get('/v1/strategies', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const rows = await listStrategies(db, ctx.orgId);
    return { strategies: rows };
  });

  app.get('/v1/strategies/summary', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    return getStrategySummary(db, ctx.orgId);
  });

  app.get('/v1/strategies/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { id } = request.params as { id: string };
    const strategy = await getStrategy(db, ctx.orgId, id);
    if (!strategy) { reply.code(404); return { error: { code: 'not_found', message: 'Strategy not found' } }; }
    return strategy;
  });

  app.patch('/v1/strategies/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { id } = request.params as { id: string };
    const body = updateStrategyBody.parse(request.body);
    const strategy = await updateStrategy(db, ctx.orgId, ctx.userId, id, body as any);
    if (!strategy) { reply.code(404); return { error: { code: 'not_found', message: 'Strategy not found' } }; }
    return strategy;
  });

  // ── Objectives ──────────────────────────────────────────────────────────

  app.post('/v1/objectives', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const body = createObjectiveBody.parse(request.body);
    const objective = await createObjective(db, ctx.orgId, ctx.userId, body as any);
    reply.code(201);
    return objective;
  });

  app.get('/v1/objectives', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { strategyId } = (request.query as Record<string, string>) || {};
    const rows = await listObjectives(db, ctx.orgId, strategyId);
    return { objectives: rows };
  });

  app.get('/v1/objectives/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { id } = request.params as { id: string };
    const objective = await getObjective(db, ctx.orgId, id);
    if (!objective) { reply.code(404); return { error: { code: 'not_found', message: 'Objective not found' } }; }
    return objective;
  });

  app.patch('/v1/objectives/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { id } = request.params as { id: string };
    const body = updateObjectiveBody.parse(request.body);
    const objective = await updateObjective(db, ctx.orgId, ctx.userId, id, body as any);
    if (!objective) { reply.code(404); return { error: { code: 'not_found', message: 'Objective not found' } }; }
    return objective;
  });

  // ── Key Results ─────────────────────────────────────────────────────────

  app.post('/v1/key-results', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const body = createKRBody.parse(request.body);
    const kr = await createKeyResult(db, ctx.orgId, ctx.userId, body as any);
    reply.code(201);
    return kr;
  });

  app.get('/v1/key-results', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { objectiveId } = request.query as { objectiveId: string };
    if (!objectiveId) { reply.code(400); return { error: { code: 'missing_param', message: 'objectiveId is required' } }; }
    const rows = await listKeyResults(db, ctx.orgId, objectiveId);
    return { keyResults: rows };
  });

  app.patch('/v1/key-results/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { id } = request.params as { id: string };
    const body = updateKRBody.parse(request.body);
    const kr = await updateKeyResult(db, ctx.orgId, ctx.userId, id, body as any);
    if (!kr) { reply.code(404); return { error: { code: 'not_found', message: 'Key Result not found' } }; }
    return kr;
  });

  // ── Initiatives ─────────────────────────────────────────────────────────

  app.post('/v1/initiatives', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const body = createInitiativeBody.parse(request.body);
    const initiative = await createInitiative(db, ctx.orgId, ctx.userId, body as any);
    reply.code(201);
    return initiative;
  });

  app.get('/v1/initiatives', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { objectiveId } = (request.query as Record<string, string>) || {};
    const rows = await listInitiatives(db, ctx.orgId, objectiveId);
    return { initiatives: rows };
  });
}
