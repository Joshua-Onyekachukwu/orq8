import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import * as teamService from '../services/teams.js';
import * as deptService from '../services/departments.js';
import type { AppDeps } from '../types.js';

export function registerTeamRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** List all teams for the org with member counts. */
  app.get('/v1/teams', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const includeArchived = url.searchParams.get('include_archived') === 'true';
    const teams = await teamService.findByOrg(db, ctx.orgId, includeArchived);
    return { data: teams };
  });

  /** Get a single team. */
  app.get<{ Params: { id: string } }>('/v1/teams/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.id)) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Team not found' } };
    }
    const team = await teamService.findById(db, ctx.orgId, request.params.id);
    if (!team) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Team not found' } };
    }
    return { data: team };
  });

  /** Create a new team. */
  app.post('/v1/teams', async (request, reply) => {
    const ctx = await requireAuth(request, deps);

    const body = z.object({
      name: z.string().min(1).max(100).trim(),
      description: z.string().max(500).optional(),
      lead: z.string().max(100).optional(),
      departmentId: z.string().uuid().optional().nullable(),
    }).safeParse(request.body);
    if (!body.success) throw validation(body.error.flatten());

    // Check for duplicate name within org
    const existing = await teamService.findByName(db, ctx.orgId, body.data.name);
    if (existing) {
      return reply.status(409).send({
        error: { code: 'conflict', message: `Team "${body.data.name}" already exists.` },
      });
    }

    // Validate department belongs to this org when provided
    if (body.data.departmentId) {
      const dept = await deptService.findById(db, ctx.orgId, body.data.departmentId);
      if (!dept) {
        return reply.status(400).send({
          error: { code: 'bad_request', message: 'Department not found in this organization.' },
        });
      }
    }

    try {
      const team = await teamService.createTeam(db, {
        orgId: ctx.orgId,
        name: body.data.name,
        description: body.data.description ?? undefined,
        lead: body.data.lead ?? undefined,
        departmentId: body.data.departmentId ?? null,
      });

      await appendAudit(db, {
        orgId: ctx.orgId,
        actorType: 'user',
        actorId: ctx.userId,
        action: 'team.created',
        outcome: 'success',
      });

      return reply.status(201).send({ data: team });
    } catch (err: any) {
      if (err.message?.includes('supabase/migrations/0003')) {
        return reply.status(503).send({
          error: { code: 'not_ready', message: 'Teams feature requires database migration. Run supabase/migrations/0003_add_teams.sql first.' },
        });
      }
      throw err;
    }
  });

  /** Update a team — rename, edit metadata, assign department, archive. */
  app.patch<{ Params: { id: string } }>('/v1/teams/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);

    const body = z.object({
      name: z.string().min(1).max(100).trim().optional(),
      description: z.string().max(500).optional().nullable(),
      lead: z.string().max(100).optional().nullable(),
      departmentId: z.string().uuid().optional().nullable(),
      status: z.enum(['active', 'archived']).optional(),
    }).safeParse(request.body);
    if (!body.success) throw validation(body.error.flatten());

    const team = await teamService.findById(db, ctx.orgId, request.params.id);
    if (!team) {
      return reply.status(404).send({
        error: { code: 'not_found', message: 'Team not found.' },
      });
    }

    if (body.data.name && body.data.name !== team.name) {
      const existing = await teamService.findByName(db, ctx.orgId, body.data.name);
      if (existing) {
        return reply.status(409).send({
          error: { code: 'conflict', message: `Team "${body.data.name}" already exists.` },
        });
      }
    }

    if (body.data.departmentId) {
      const dept = await deptService.findById(db, ctx.orgId, body.data.departmentId);
      if (!dept) {
        return reply.status(400).send({
          error: { code: 'bad_request', message: 'Department not found in this organization.' },
        });
      }
    }

    const updated = await teamService.updateTeam(db, ctx.orgId, request.params.id, {
      name: body.data.name ?? undefined,
      description: body.data.description ?? undefined,
      lead: body.data.lead ?? undefined,
      departmentId: body.data.departmentId ?? undefined,
      status: body.data.status ?? undefined,
    });

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: body.data.status === 'archived' ? 'team.archived' : 'team.updated',
      outcome: 'success',
    });

    return { data: updated };
  });

  /** Delete a team (only if no agents are members). */
  app.delete<{ Params: { id: string } }>('/v1/teams/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);

    try {
      const deleted = await teamService.deleteTeam(db, ctx.orgId, request.params.id);
      if (!deleted) {
        return reply.status(404).send({
          error: { code: 'not_found', message: 'Team not found.' },
        });
      }

      await appendAudit(db, {
        orgId: ctx.orgId,
        actorType: 'user',
        actorId: ctx.userId,
        action: 'team.deleted',
        outcome: 'success',
      });

      return { data: { deleted: true } };
    } catch (err: any) {
      if (err.message?.includes('still assigned')) {
        return reply.status(409).send({
          error: { code: 'conflict', message: err.message },
        });
      }
      throw err;
    }
  });
}