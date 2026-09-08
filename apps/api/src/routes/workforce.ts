import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { departmentTemplates, teamTemplates, agentTemplates, agents } from '@orq8/db';
import * as workforce from '../services/workforce-engine.js';
import { enforceResourceLimit } from '../services/entitlements.js';
import type { AppDeps } from '../types.js';

export function registerWorkforceRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  // ─── Department Templates ────────────────────────────────────────────

  /** List department templates (system + org-scoped). */
  app.get('/v1/department-templates', async (request) => {
    const ctx = await requireAuth(request, deps);
    const templates = await db
      .select()
      .from(departmentTemplates)
      .where(
        and(
          eq(departmentTemplates.isSystem, true),
        ),
      )
      .orderBy(departmentTemplates.name);
    return { data: templates };
  });

  /** Create a custom department template. */
  app.post('/v1/department-templates', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const body = z.object({
      name: z.string().min(1).max(100).trim(),
      slug: z.string().min(1).max(100).trim().regex(/^[a-z0-9-]+$/),
      description: z.string().max(500).optional(),
      mission: z.string().max(1000).optional(),
      functions: z.array(z.string()).optional(),
      roles: z.array(z.string()).optional(),
      teams: z.array(z.object({ name: z.string(), description: z.string().optional() })).optional(),
      industry: z.string().optional(),
    }).safeParse(request.body);
    if (!body.success) throw validation(body.error.flatten());

    const [created] = await db
      .insert(departmentTemplates)
      .values({
        name: body.data.name,
        slug: body.data.slug,
        description: body.data.description,
        mission: body.data.mission,
        functions: body.data.functions ?? [],
        roles: body.data.roles ?? [],
        teams: body.data.teams ?? [],
        typicalGoals: [],
        kpis: [],
        industry: body.data.industry,
        isSystem: false,
        createdBy: ctx.userId,
        orgId: ctx.orgId,
      })
      .returning();

    return reply.status(201).send({ data: created });
  });

  // ─── Team Templates ──────────────────────────────────────────────────

  /** List team templates (system-scoped). */
  app.get('/v1/team-templates', async (request) => {
    const ctx = await requireAuth(request, deps);
    const templates = await db
      .select()
      .from(teamTemplates)
      .where(eq(teamTemplates.isSystem, true))
      .orderBy(teamTemplates.name);
    return { data: templates };
  });

  /** Create a custom team template. */
  app.post('/v1/team-templates', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const body = z.object({
      name: z.string().min(1).max(100).trim(),
      slug: z.string().min(1).max(100).trim().regex(/^[a-z0-9-]+$/),
      description: z.string().max(500).optional(),
      mission: z.string().max(1000).optional(),
      responsibilities: z.array(z.string()).optional(),
      required_capabilities: z.array(z.string()).optional(),
      department_slug: z.string().optional(),
    }).safeParse(request.body);
    if (!body.success) throw validation(body.error.flatten());

    const [created] = await db
      .insert(teamTemplates)
      .values({
        name: body.data.name,
        slug: body.data.slug,
        description: body.data.description,
        mission: body.data.mission,
        responsibilities: body.data.responsibilities ?? [],
        requiredCapabilities: body.data.required_capabilities ?? [],
        recommendedRoles: [],
        kpis: [],
        departmentSlug: body.data.department_slug,
        isSystem: false,
        createdBy: ctx.userId,
        orgId: ctx.orgId,
      })
      .returning();

    return reply.status(201).send({ data: created });
  });

  // ─── Agent Templates ────────────────────────────────────────────────

  /** List agent templates (system + org-scoped). */
  app.get('/v1/agent-templates', async (request) => {
    const ctx = await requireAuth(request, deps);
    const templates = await db
      .select()
      .from(agentTemplates)
      .where(
        and(
          eq(agentTemplates.isSystem, true),
        ),
      )
      .orderBy(agentTemplates.category, agentTemplates.name);
    return { data: templates };
  });

  /** Create a custom agent template. */
  app.post('/v1/agent-templates', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const body = z.object({
      name: z.string().min(1).max(100).trim(),
      slug: z.string().min(1).max(100).trim().regex(/^[a-z0-9-]+$/),
      category: z.string().max(50).optional(),
      description: z.string().max(500).optional(),
      role: z.string().min(1).max(100).trim(),
      capabilities: z.array(z.string()).optional(),
      suggestedAutonomy: z.string().optional(),
      suggestedDepartmentSlug: z.string().optional(),
      suggestedTeamSlug: z.string().optional(),
      typicalTasks: z.array(z.string()).optional(),
      requiredTools: z.array(z.string()).optional(),
    }).safeParse(request.body);
    if (!body.success) throw validation(body.error.flatten());

    const [created] = await db
      .insert(agentTemplates)
      .values({
        name: body.data.name,
        slug: body.data.slug,
        category: body.data.category ?? 'general',
        description: body.data.description,
        role: body.data.role,
        capabilities: body.data.capabilities ?? [],
        suggestedAutonomy: body.data.suggestedAutonomy ?? 'execute_with_approval',
        suggestedDepartmentSlug: body.data.suggestedDepartmentSlug,
        suggestedTeamSlug: body.data.suggestedTeamSlug,
        typicalTasks: body.data.typicalTasks ?? [],
        requiredTools: body.data.requiredTools ?? [],
        isSystem: false,
        orgId: ctx.orgId,
      })
      .returning();

    return reply.status(201).send({ data: created });
  });

  /** Hire an agent from a template — creates the agent and assigns to dept/team. */
  app.post('/v1/agent-templates/:templateId/hire', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { templateId } = request.params as { templateId: string };
    const body = z.object({
      name: z.string().min(1).max(100).trim().optional(),
      departmentId: z.string().uuid().optional(),
      teamId: z.string().uuid().optional(),
    }).safeParse(request.body);
    if (!body.success) throw validation(body.error.flatten());

    // Fetch the template
    const [template] = await db
      .select()
      .from(agentTemplates)
      .where(eq(agentTemplates.id, templateId))
      .limit(1);
    if (!template) return reply.status(404).send({ error: 'Template not found' });

    // Enforce agent limits
    try {
      await enforceResourceLimit(db, ctx.orgId, 'agents');
    } catch (err: any) {
      return reply.status(403).send({ error: err.message || 'Agent limit reached' });
    }

    // Create the agent from template
    const agentName = body.data.name ?? template.name;
    const [agent] = await db
      .insert(agents)
      .values({
        orgId: ctx.orgId,
        name: agentName,
        role: template.role,
        departmentId: body.data.departmentId ?? null,
        teamId: body.data.teamId ?? null,
        status: 'active',
        autonomyLevel: template.suggestedAutonomy,
        capabilities: template.capabilities as string[],
      })
      .returning();

    if (!agent) return reply.status(500).send({ error: 'Failed to create agent' });

    return reply.status(201).send({ data: agent });
  });

  // ─── Workforce Coverage ──────────────────────────────────────────────

  /** Get department-level workforce coverage for the org. */
  app.get('/v1/workforce/departments', async (request) => {
    const ctx = await requireAuth(request, deps);
    const coverage = await workforce.calculateDepartmentCoverage(db, ctx.orgId);
    return { data: coverage };
  });

  /** Get team-level workforce coverage for the org. */
  app.get('/v1/workforce/teams', async (request) => {
    const ctx = await requireAuth(request, deps);
    const coverage = await workforce.calculateTeamCoverage(db, ctx.orgId);
    return { data: coverage };
  });

  /** Get org-wide workforce summary. */
  app.get('/v1/workforce/summary', async (request) => {
    const ctx = await requireAuth(request, deps);
    const summary = await workforce.calculateOrgWorkforceSummary(db, ctx.orgId);
    return { data: summary };
  });
}
