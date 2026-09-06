import { z } from 'zod';
import { validation, forbidden } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import {
  analyzeBusinessImport,
  approveBusinessImport,
  generateProposalForImport,
  getBusinessImport,
  listBusinessImports,
  rejectBusinessImport,
  BusinessImportStateError,
  UnsafeUrlError,
  WebsiteUnreachableError,
} from '../services/business-import.js';
import type { AppDeps } from '../types.js';

const analyzeBody = z.object({
  description: z.string().trim().max(4000).optional(),
  websiteUrl: z.string().trim().max(2048).optional(),
}).refine((v) => (v.description?.trim()?.length ?? 0) > 0 || (v.websiteUrl?.trim()?.length ?? 0) > 0, {
  message: 'Provide a company description, a website URL, or both.',
});

function toHttpError(err: unknown): unknown {
  if (err instanceof BusinessImportStateError) return validation({ message: err.message });
  if (err instanceof UnsafeUrlError) return validation({ message: err.message });
  if (err instanceof WebsiteUnreachableError) return validation({ message: err.message });
  return err;
}

/**
 * Business Import (Phase 10):
 *   POST /v1/business-imports/analyze   — description/website → structured facts
 *   POST /v1/business-imports/:id/propose — generate reviewable org proposal
 *   POST /v1/business-imports/:id/approve — founder gate → apply via org builder
 *   POST /v1/business-imports/:id/reject  — founder decline (nothing applied)
 *   GET  /v1/business-imports          — list recent imports
 *   GET  /v1/business-imports/:id      — full detail incl. facts + proposal
 */
export function registerBusinessImportRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.post('/v1/business-imports/analyze', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = analyzeBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());
    try {
      const imp = await analyzeBusinessImport(db, ctx.orgId, ctx.userId, parsed.data, { config: deps.config });
      reply.code(201);
      return { data: imp };
    } catch (err) {
      throw toHttpError(err);
    }
  });

  app.get('/v1/business-imports', async (request) => {
    const ctx = await requireAuth(request, deps);
    const imports = await listBusinessImports(db, ctx.orgId);
    return { data: imports };
  });

  app.get('/v1/business-imports/:id', async (request) => {
    const ctx = await requireAuth(request, deps);
    const { id } = request.params as { id: string };
    const imp = await getBusinessImport(db, ctx.orgId, id);
    if (!imp) return { data: null };
    return { data: imp };
  });

  app.post('/v1/business-imports/:id/propose', async (request) => {
    const ctx = await requireAuth(request, deps);
    const { id } = request.params as { id: string };
    try {
      const imp = await generateProposalForImport(db, ctx.orgId, ctx.userId, id);
      return { data: imp };
    } catch (err) {
      throw toHttpError(err);
    }
  });

  app.post('/v1/business-imports/:id/approve', async (request) => {
    const ctx = await requireAuth(request, deps);
    if (ctx.role !== 'owner' && ctx.role !== 'admin') throw forbidden('Only owners and admins can apply an imported organization.');
    const { id } = request.params as { id: string };
    try {
      const imp = await approveBusinessImport(db, ctx.orgId, ctx.userId, id);
      return { data: imp };
    } catch (err) {
      throw toHttpError(err);
    }
  });

  app.post('/v1/business-imports/:id/reject', async (request) => {
    const ctx = await requireAuth(request, deps);
    if (ctx.role !== 'owner' && ctx.role !== 'admin') throw forbidden('Only owners and admins can reject an import.');
    const { id } = request.params as { id: string };
    try {
      const imp = await rejectBusinessImport(db, ctx.orgId, ctx.userId, id);
      return { data: imp };
    } catch (err) {
      throw toHttpError(err);
    }
  });
}
