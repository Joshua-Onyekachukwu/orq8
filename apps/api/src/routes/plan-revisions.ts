/**
 * ORQ8 Plan Revisions Routes — docs/71 §R item 4
 *
 * The Plan page's revision rail + ratify flow. All operations are org-scoped
 * and audited. Ratifying is the founder's move: draft → direction.
 */

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import {
  createPlanRevision,
  listPlanRevisions,
  ratifyPlanRevision,
  rejectPlanRevision,
} from '../services/plan-revisions.js';
import type { AppDeps } from '../types.js';

const planContentSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .nullable();

const createRevisionBody = z.object({
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().max(2000).optional().nullable(),
  content: planContentSchema,
  // Atlas drafts as an agent; the founder can also author directly.
  authorType: z.enum(['user', 'agent']).optional(),
  authorId: z.string().uuid().optional().nullable(),
  authorName: z.string().trim().min(1).max(120).optional().nullable(),
});

const ratifyBody = z.object({
  // Snapshot of who pressed the button, for the audit trail + rail label.
  ratifierName: z.string().trim().min(1).max(120).optional(),
});

const rejectBody = z.object({
  rejectorName: z.string().trim().min(1).max(120).optional(),
});

export function registerPlanRevisionRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.get('/v1/plan-revisions', async (request) => {
    const ctx = await requireAuth(request, deps);
    return listPlanRevisions(db, ctx.orgId);
  });

  app.post('/v1/plan-revisions', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const body = createRevisionBody.parse(request.body);
    const revision = await createPlanRevision(db, ctx.orgId, {
      title: body.title,
      summary: body.summary ?? null,
      content: body.content ?? {},
      authorType: body.authorType ?? 'user',
      authorId: body.authorId ?? (body.authorType === 'agent' ? null : ctx.userId),
      authorName: body.authorName ?? ctx.email,
    });
    reply.code(201);
    return revision;
  });

  app.post('/v1/plan-revisions/:id/ratify', async (request) => {
    const ctx = await requireAuth(request, deps);
    const { id } = request.params as { id: string };
    const body = ratifyBody.parse(request.body ?? {});
    return ratifyPlanRevision(db, ctx.orgId, id, {
      type: 'user',
      id: ctx.userId,
      name: body.ratifierName ?? ctx.email,
    });
  });

  app.post('/v1/plan-revisions/:id/reject', async (request) => {
    const ctx = await requireAuth(request, deps);
    const { id } = request.params as { id: string };
    const body = rejectBody.parse(request.body ?? {});
    return rejectPlanRevision(db, ctx.orgId, id, {
      type: 'user',
      id: ctx.userId,
      name: body.rejectorName ?? ctx.email,
    });
  });
}
