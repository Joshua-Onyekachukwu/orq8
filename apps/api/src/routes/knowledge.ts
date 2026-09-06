import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import {
  upsertEntity,
  upsertRelation,
  linkEntitiesByName,
  recordDecision,
  listEntities,
  searchKnowledge,
  retrieveKnowledgeContext,
  validateKnowledgeInput,
} from '../services/knowledge-graph.js';
import { appendAudit } from '../services/audit.js';
import type { AppDeps } from '../types.js';

const entityBody = z.object({
  type: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  summary: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  source: z.string().max(200).optional(),
});

const relationBody = z.object({
  fromEntityId: z.string().uuid(),
  toEntityId: z.string().uuid(),
  relationType: z.string().trim().min(1).max(50),
  source: z.string().max(200).optional(),
});

const linkBody = z.object({
  from: z.object({ type: z.string().trim().min(1).max(50), name: z.string().trim().min(1).max(200), summary: z.string().max(2000).optional() }),
  to: z.object({ type: z.string().trim().min(1).max(50), name: z.string().trim().min(1).max(200), summary: z.string().max(2000).optional() }),
  relationType: z.string().trim().min(1).max(50),
});

const decisionBody = z.object({
  title: z.string().trim().min(1).max(300),
  summary: z.string().max(2000).optional(),
  context: z.string().max(3000).optional(),
  rationale: z.string().max(3000).optional(),
  alternatives: z.array(z.object({ label: z.string().max(200), pros: z.string().max(1000).optional(), cons: z.string().max(1000).optional() })).max(20).optional(),
  outcome: z.enum(['approved', 'rejected', 'modified', 'pending']).optional(),
  source: z.string().max(200).optional(),
});

export function registerKnowledgeRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** List entities, optionally filtered by type. */
  app.get('/v1/knowledge/entities', async (request) => {
    const ctx = await requireAuth(request, deps);
    const q = request.query as { type?: string; limit?: string };
    const entities = await listEntities(db, ctx.orgId, q.type, Math.min(Number(q.limit) || 100, 200));
    return { data: entities };
  });

  /** Create (or dedupe-return) an entity. */
  app.post('/v1/knowledge/entities', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = entityBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());
    const invalid = validateKnowledgeInput(parsed.data.type, parsed.data.name);
    if (invalid) {
      reply.code(400);
      return { error: { code: 'invalid_entity', message: invalid } };
    }

    const entity = await upsertEntity(db, ctx.orgId, { ...parsed.data, source: parsed.data.source ?? 'user' });
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'knowledge.entity.created',
      outcome: 'success',
      resultRef: `${entity.type}:${entity.name}`,
    });
    reply.code(201);
    return { data: entity };
  });

  /** Create a relation between two existing entities. */
  app.post('/v1/knowledge/relations', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = relationBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());
    const invalid = validateKnowledgeInput(undefined, undefined, parsed.data.relationType);
    if (invalid) {
      reply.code(400);
      return { error: { code: 'invalid_relation', message: invalid } };
    }

    const relation = await upsertRelation(db, ctx.orgId, { ...parsed.data, source: parsed.data.source ?? 'user' });
    reply.code(201);
    return { data: relation };
  });

  /** Ensure both entities exist (by type+name) and link them — one call. */
  app.post('/v1/knowledge/link', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = linkBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const linked = await linkEntitiesByName(db, ctx.orgId, {
      from: { ...parsed.data.from, source: 'user' },
      to: { ...parsed.data.to, source: 'user' },
      relationType: parsed.data.relationType,
      source: 'user',
    });
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'knowledge.relation.created',
      outcome: 'success',
      resultRef: `${linked.from.name} --${parsed.data.relationType}--> ${linked.to.name}`,
    });
    reply.code(201);
    return { data: linked };
  });

  /** Record a decision with context/rationale/alternatives (decision memory). */
  app.post('/v1/knowledge/decisions', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = decisionBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const decision = await recordDecision(db, ctx.orgId, {
      ...parsed.data,
      source: parsed.data.source ?? 'user',
      actorType: 'user',
      actorId: ctx.userId,
    });
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'knowledge.decision.recorded',
      outcome: 'success',
      resultRef: decision.title,
    });
    reply.code(201);
    return { data: decision };
  });

  /** Search entities + relations + decisions (org-scoped). */
  app.get('/v1/knowledge/search', async (request) => {
    const ctx = await requireAuth(request, deps);
    const q = request.query as { query?: string; limit?: string };
    const result = await searchKnowledge(db, ctx.orgId, q.query ?? '', Math.min(Number(q.limit) || 12, 50));
    return { data: result };
  });

  /** Compact knowledge context for agent prompts (bounded, org-scoped). */
  app.get('/v1/knowledge/context', async (request) => {
    const ctx = await requireAuth(request, deps);
    const q = request.query as { query?: string; limit?: string };
    const block = await retrieveKnowledgeContext(db, ctx.orgId, q.query ?? '', Math.min(Number(q.limit) || 6, 15));
    return { data: block };
  });
}