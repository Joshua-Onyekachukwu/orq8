import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import { agents, organizations } from '@orq8/db';
import type { AppDeps } from '../types.js';

/**
 * Departments are derived from the `department` field on agents.
 * Additionally, department-level settings (budget, permissions) are stored
 * in the organization's settings JSONB under `departments`.
 */

function getDeptSettings(settings: Record<string, unknown> | null) {
  if (!settings || typeof settings !== 'object') return {};
  return ((settings as Record<string, unknown>).departments as Record<string, Record<string, unknown>>) ?? {};
}

export function registerDepartmentRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** List all departments for the org (derived from agents + settings). */
  app.get('/v1/departments', async (request) => {
    const ctx = await requireAuth(request, deps);

    // Get distinct departments and their agent counts
    const deptRows = await db
      .select({
        name: agents.department,
        agentCount: sql<number>`count(*)::int`,
        activeCount: sql<number>`count(case when ${agents.status} = 'active' then 1 end)::int`,
      })
      .from(agents)
      .where(and(eq(agents.orgId, ctx.orgId), sql`${agents.department} IS NOT NULL`))
      .groupBy(agents.department)
      .orderBy(agents.department);

    // Get department settings from org settings
    const orgResult = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId))
      .limit(1);

    const deptSettings = getDeptSettings(orgResult[0]?.settings as Record<string, unknown> | null);

    const departments = deptRows.map((row) => ({
      name: row.name,
      agentCount: row.agentCount,
      activeCount: row.activeCount,
      budget: deptSettings[row.name ?? '']?.budget ?? null,
      head: deptSettings[row.name ?? '']?.head ?? null,
      description: deptSettings[row.name ?? '']?.description ?? null,
    }));

    // If no departments exist, return a default "Unassigned" entry
    if (departments.length === 0) {
      const unassigned = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(agents)
        .where(and(eq(agents.orgId, ctx.orgId), sql`${agents.department} IS NULL`));

      if (unassigned[0]?.count && unassigned[0].count > 0) {
        departments.push({
          name: null,
          agentCount: unassigned[0].count,
          activeCount: unassigned[0].count,
          budget: null,
          head: null,
          description: 'Agents not yet assigned to a department',
        });
      }
    }

    return { data: departments };
  });

  /** Update department settings. */
  app.patch<{ Params: { name: string } }>('/v1/departments/:name', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const body = z.object({
      budget: z.number().int().min(0).optional().nullable(),
      head: z.string().max(100).optional().nullable(),
      description: z.string().max(500).optional().nullable(),
    }).safeParse(request.body);
    if (!body.success) throw validation(body.error.flatten());

    const deptName = decodeURIComponent(request.params.name);

    // Get current settings
    const result = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId))
      .limit(1);

    const currentSettings = (result[0]?.settings as Record<string, unknown>) ?? {};
    const departments = (currentSettings.departments as Record<string, Record<string, unknown>>) ?? {};

    departments[deptName] = {
      ...departments[deptName],
      ...Object.fromEntries(
        Object.entries(body.data).filter(([, v]) => v !== undefined)
      ),
    };

    await db
      .update(organizations)
      .set({ settings: { ...currentSettings, departments } })
      .where(eq(organizations.id, ctx.orgId));

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'department.updated',
      outcome: 'success',
    });

    return { data: departments[deptName] };
  });
}
