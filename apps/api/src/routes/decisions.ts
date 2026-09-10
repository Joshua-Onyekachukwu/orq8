/**
 * ORQ8 Decision Memory Routes
 *
 * POST   /v1/decisions          — Record a new decision
 * GET    /v1/decisions          — List decisions (filterable)
 * GET    /v1/decisions/summary  — Summary stats + learning score
 * GET    /v1/decisions/:id      — Get a single decision
 * PATCH  /v1/decisions/:id      — Update (file outcome, reverse, etc.)
 */

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import {
  createDecision, listDecisions, getDecision, updateDecision, getDecisionSummary,
} from '../services/decision-memory.js';
import { signalSummary } from '../services/decision-signals.js';
import type { AppDeps } from '../types.js';

const createDecisionBody = z.object({
  title: z.string().trim().min(1).max(500),
  decisionType: z.enum(['strategic', 'operational', 'hiring', 'resource_allocation', 'technical', 'partnership', 'product', 'marketing', 'financial']).optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  decisionMakerType: z.enum(['user', 'agent']).optional(),
  decisionMakerId: z.string().uuid().optional(),
  decisionMakerName: z.string().max(200).optional(),
  whatWasDecided: z.string().trim().min(1).max(5000),
  rationale: z.string().max(5000).optional(),
  alternatives: z.array(z.object({ name: z.string(), reasonRejected: z.string() })).optional(),
  evidence: z.array(z.object({ source: z.string(), type: z.string(), summary: z.string() })).optional(),
  assumptions: z.array(z.string()).optional(),
  expectedOutcome: z.string().max(2000).optional(),
  reversalConditions: z.array(z.string()).optional(),
  strategyId: z.string().uuid().optional(),
  objectiveId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  decidedAt: z.string().datetime().optional(),
});

const updateDecisionBody = z.object({
  status: z.enum(['pending', 'active', 'validated', 'reversed', 'archived']).optional(),
  actualOutcome: z.string().max(5000).optional(),
  lessonsLearned: z.string().max(5000).optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  rationale: z.string().max(5000).optional(),
  reversalConditions: z.array(z.string()).optional(),
});

export function registerDecisionRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** POST /v1/decisions — Record a new decision */
  app.post('/v1/decisions', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const body = createDecisionBody.parse(request.body);
    const decision = await createDecision(db, ctx.orgId, ctx.userId, body as any);
    reply.code(201);
    return decision;
  });

  /** GET /v1/decisions — List decisions */
  app.get('/v1/decisions', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const result = await listDecisions(db, ctx.orgId, {
      decisionType: url.searchParams.get('type') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      decisionMakerType: url.searchParams.get('maker') ?? undefined,
      limit: Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200),
      offset: parseInt(url.searchParams.get('offset') ?? '0', 10),
    });
    return result;
  });

  /** GET /v1/decisions/summary — Summary stats + learning score */
  app.get('/v1/decisions/summary', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    return getDecisionSummary(db, ctx.orgId);
  });

  /** GET /v1/decisions/signals — §20 phase 2: model/agent performance signals
   * derived from filed outcome reviews (measured data, explicit when thin). */
  app.get('/v1/decisions/signals', async (request) => {
    const ctx = await requireAuth(request, deps);
    return signalSummary(db, ctx.orgId);
  });

  /** GET /v1/decisions/:id — Get a single decision */
  app.get('/v1/decisions/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { id } = request.params as { id: string };
    const decision = await getDecision(db, ctx.orgId, id);
    if (!decision) { reply.code(404); return { error: { code: 'not_found', message: 'Decision not found' } }; }
    return decision;
  });

  /** PATCH /v1/decisions/:id — Update a decision */
  app.patch('/v1/decisions/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { id } = request.params as { id: string };
    const body = updateDecisionBody.parse(request.body);
    const decision = await updateDecision(db, ctx.orgId, ctx.userId, id, body as any);
    if (!decision) { reply.code(404); return { error: { code: 'not_found', message: 'Decision not found' } }; }
    return decision;
  });
}
