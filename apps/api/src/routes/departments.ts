import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import { departments as deptTable, agents } from '@orq8/db';
import * as deptService from '../services/departments.js';
import type { AppDeps } from '../types.js';

export function registerDepartmentRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** List all departments for the org with agent counts. */
  app.get('/v1/departments', async (request) => {
    const ctx = await requireAuth(request, deps);

    const depts = await deptService.findByOrg(db, ctx.orgId);

    // Also get unassigned agents count
    const unassigned = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(agents)
      .where(and(eq(agents.orgId, ctx.orgId), sql`${agents.departmentId} IS NULL`));

    const result: Array<{
      id: string | null;
      name: string | null;
      description: string | null;
      head: string | null;
      budget: number | null;
      status: string;
      agentCount: number;
      activeCount: number;
      createdAt: Date | null;
    }> = depts.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      head: d.head,
      budget: d.budget,
      status: d.status,
      agentCount: d.agentCount,
      activeCount: d.activeCount,
      createdAt: d.createdAt,
    }));

    // Add unassigned group if any agents lack a department
    if (unassigned[0]?.count && unassigned[0].count > 0) {
      result.push({
        id: null,
        name: null,
        description: 'Agents not yet assigned to a department',
        head: null,
        budget: null,
        status: 'active',
        agentCount: unassigned[0].count,
        activeCount: unassigned[0].count,
        createdAt: null,
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

    const dept = await deptService.createDepartment(db, {
      orgId: ctx.orgId,
      name: body.data.name,
      description: body.data.description ?? null,
      head: body.data.head ?? null,
      budget: body.data.budget ?? null,
    });

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'department.created',
      outcome: 'success',
    });

    return reply.status(201).send({ data: dept });
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

    const updated = await deptService.updateDepartment(db, ctx.orgId, request.params.id, body.data);

    // Sync the agent.department text field for backward compat
    if (body.data.name && updated) {
      await db
        .update(agents)
        .set({ department: updated.name, updatedAt: new Date() })
        .where(and(eq(agents.departmentId, dept.id), eq(agents.orgId, ctx.orgId)));
    }

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'department.updated',
      outcome: 'success',
    });

    return { data: updated };
  });

  /** Archive (soft-delete) a department. Moves agents to unassigned. */
  app.delete<{ Params: { id: string } }>('/v1/departments/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);

    const dept = await deptService.findById(db, ctx.orgId, request.params.id);
    if (!dept) {
      return reply.status(404).send({
        error: { code: 'not_found', message: 'Department not found.' },
      });
    }

    await deptService.archiveDepartment(db, ctx.orgId, request.params.id);

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'department.archived',
      outcome: 'success',
    });

    return { data: { archived: true } };
  });

  /** Assign an agent to a department. */
  app.post<{ Params: { id: string } }>('/v1/departments/:id/agents', async (request, reply) => {
    const ctx = await requireAuth(request, deps);

    const body = z.object({
      agentId: z.string().uuid(),
    }).safeParse(request.body);
    if (!body.success) throw validation(body.error.flatten());

    // Verify department exists
    const dept = await deptService.findById(db, ctx.orgId, request.params.id);
    if (!dept) {
      return reply.status(404).send({
        error: { code: 'not_found', message: 'Department not found.' },
      });
    }

    await deptService.assignAgent(db, ctx.orgId, body.data.agentId, dept.id);

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'agent.department_assigned',
      outcome: 'success',
    });

    return { data: { assigned: true } };
  });

  /** Remove an agent from their department (make unassigned). */
  app.delete<{ Params: { id: string; agentId: string } }>('/v1/departments/:id/agents/:agentId', async (request, reply) => {
    const ctx = await requireAuth(request, deps);

    await deptService.assignAgent(db, ctx.orgId, request.params.agentId, null);

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'agent.department_removed',
      outcome: 'success',
    });

    return { data: { removed: true } };
  });
}
