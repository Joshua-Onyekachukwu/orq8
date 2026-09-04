import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import { agents } from '@orq8/db';
import * as deptService from '../services/departments.js';
import type { AppDeps } from '../types.js';

export function registerDepartmentRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, logger } = deps;

  /** List all departments for the org with agent counts. */
  app.get('/v1/departments', async (request) => {
    const ctx = await requireAuth(request, deps);
    const depts = await deptService.findByOrg(db, ctx.orgId);

    // Get unassigned agents count (where department_id IS NULL)
    let unassignedCount = 0;
    try {
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(agents)
        .where(and(eq(agents.orgId, ctx.orgId), sql`${agents.departmentId} IS NULL`));
      unassignedCount = result?.count ?? 0;
    } catch {
      // department_id column may not exist yet
      unassignedCount = 0;
    }

    const result = depts.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      head: d.head,
      budget: d.budget,
      status: d.status,
      agentCount: d.agentCount,
      createdAt: d.createdAt,
    }));

    // Add unassigned group
    if (unassignedCount > 0) {
      result.push({
        id: null as unknown as string,
        name: 'Unassigned',
        description: 'Agents not yet assigned to a department',
        head: null,
        budget: null,
        status: 'active',
        agentCount: unassignedCount,
        createdAt: null as unknown as Date,
      });
    }

    return { data: result };
  });

  /** Create a new department. */
  app.post('/v1/departments', async (request, reply) => {
    const ctx = await requireAuth(request, deps);

    const body = z.object({
      name: z.string().min(1).max(100).trim(),
      description: z.string().max(500).optional(),
      head: z.string().max(100).optional(),
      budget: z.number().int().min(0).optional(),
    }).safeParse(request.body);
    if (!body.success) throw validation(body.error.flatten());

    // Check for duplicate name within org
    const existing = await deptService.findByName(db, ctx.orgId, body.data.name);
    if (existing) {
      return reply.status(409).send({
        error: { code: 'conflict', message: `Department "${body.data.name}" already exists.` },
      });
    }

    try {
      const dept = await deptService.createDepartment(db, {
        orgId: ctx.orgId,
        name: body.data.name,
        description: body.data.description ?? undefined,
        budget: body.data.budget ?? undefined,
      });

      await appendAudit(db, {
        orgId: ctx.orgId,
        actorType: 'user',
        actorId: ctx.userId,
        action: 'department.created',
        outcome: 'success',
      });

      return reply.status(201).send({ data: dept });
    } catch (err: any) {
      if (err.message?.includes('not available yet')) {
        return reply.status(503).send({
          error: { code: 'not_ready', message: 'Department feature requires database migration. Run 0002_add_departments_and_authority.sql first.' },
        });
      }
      throw err;
    }
  });

  /** Update a department. */
  app.patch<{ Params: { id: string } }>('/v1/departments/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);

    const body = z.object({
      name: z.string().min(1).max(100).trim().optional(),
      description: z.string().max(500).optional().nullable(),
      head: z.string().max(100).optional().nullable(),
      budget: z.number().int().min(0).optional().nullable(),
    }).safeParse(request.body);
    if (!body.success) throw validation(body.error.flatten());

    const dept = await deptService.findById(db, ctx.orgId, request.params.id);
    if (!dept) {
      return reply.status(404).send({
        error: { code: 'not_found', message: 'Department not found.' },
      });
    }

    // If renaming, check for duplicates
    if (body.data.name && body.data.name !== dept.name) {
      const existing = await deptService.findByName(db, ctx.orgId, body.data.name);
      if (existing) {
        return reply.status(409).send({
          error: { code: 'conflict', message: `Department "${body.data.name}" already exists.` },
        });
      }
    }

    const updated = await deptService.updateDepartment(db, ctx.orgId, request.params.id, {
      name: body.data.name ?? undefined,
      description: body.data.description ?? undefined,
      head: body.data.head ?? undefined,
      budget: body.data.budget ?? undefined,
    });

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'department.updated',
      outcome: 'success',
    });

    return { data: updated };
  });

  /** Delete a department (only if no agents assigned). */
  app.delete<{ Params: { id: string } }>('/v1/departments/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);

    try {
      const deleted = await deptService.deleteDepartment(db, ctx.orgId, request.params.id);
      if (!deleted) {
        return reply.status(404).send({
          error: { code: 'not_found', message: 'Department not found.' },
        });
      }

      await appendAudit(db, {
        orgId: ctx.orgId,
        actorType: 'user',
        actorId: ctx.userId,
        action: 'department.deleted',
        outcome: 'success',
      });

      return { data: { deleted: true } };
    } catch (err: any) {
      if (err.message?.includes('agent(s) still assigned')) {
        return reply.status(409).send({
          error: { code: 'conflict', message: err.message },
        });
      }
      throw err;
    }
  });
}
