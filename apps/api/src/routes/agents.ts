import { eq, and, sql } from 'drizzle-orm';
import { agents as agentsTable, type NewAgent } from '@orq8/db';
import { z } from 'zod';
import { validation, forbidden } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import * as agents from '../services/agents.js';
import { getPlanLimits } from '../services/billing.js';
import * as deptService from '../services/departments.js';
import * as teamService from '../services/teams.js';
import type { AppDeps } from '../types.js';

const authoritySchema = z.object({
  canCreateTasks: z.boolean().optional(),
  canExecuteTasks: z.boolean().optional(),
  canAccessCompanyInfo: z.boolean().optional(),
  canCommunicateExternally: z.boolean().optional(),
  canModifyResources: z.boolean().optional(),
  spendingLimitCents: z.number().int().min(0).optional(),
  requiresApprovalFor: z.array(z.string()).optional(),
  forbiddenActions: z.array(z.string()).optional(),
}).strict().optional();

const hireBody = z.object({
  name: z.string().trim().min(1).max(100),
  role: z.string().trim().min(1).max(100),
  department: z.string().trim().max(100).optional(), // DEPRECATED — use departmentId
  departmentId: z.string().uuid().optional(),
  team: z.string().trim().max(100).optional(), // DEPRECATED — use teamId
  teamId: z.string().uuid().optional(),
  authority: authoritySchema,
  capabilities: z.array(z.string()).optional(),
});

const patchBody = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.string().trim().min(1).max(100).optional(),
  department: z.string().trim().max(100).optional().nullable(), // DEPRECATED
  departmentId: z.string().uuid().optional().nullable(),
  team: z.string().trim().max(100).optional().nullable(), // DEPRECATED
  teamId: z.string().uuid().optional().nullable(),
  status: z.enum(['active', 'paused', 'archived']).optional(),
  authority: authoritySchema,
  capabilities: z.array(z.string()).optional(),
  currentTask: z.string().max(500).optional().nullable(),
}).strict();

export function registerAgentRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, logger } = deps;

  /** List all agents for the current org. */
  app.get('/v1/agents', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10), 0);
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentsTable)
      .where(eq(agentsTable.orgId, ctx.orgId));
    const list = await agents.findByOrg(db, ctx.orgId, { limit, offset });
    return { data: list, meta: { limit, offset, total: totalRow?.count ?? 0 } };
  });

  /** Get a single agent. */
  app.get<{ Params: { id: string } }>('/v1/agents/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    // Validate UUID format to prevent SQL errors on malformed IDs
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.id)) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Agent not found' } };
    }
    const agent = await agents.findById(db, ctx.orgId, request.params.id);
    if (!agent) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Agent not found' } };
    }
    return { data: agent };
  });

  /** Hire a new agent. */
  app.post('/v1/agents', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = hireBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    // Plan enforcement: check agent limit
    const currentAgents = await agents.findByOrg(db, ctx.orgId, { limit: 1000 });
    const planLimits = await getPlanLimits(db, ctx.orgId);
    if (planLimits.maxAgents > 0 && currentAgents.length >= planLimits.maxAgents) {
      throw forbidden(`Your plan allows ${planLimits.maxAgents} agents. Upgrade to hire more.`);
    }

    // Resolve departmentId if name-based department is provided (backward compat)
    let departmentId: string | null = null;
    let departmentName = parsed.data.department ?? null;

    // Department resolution — graceful if departments table doesn't exist yet
    try {
      if (parsed.data.departmentId) {
        departmentId = parsed.data.departmentId;
      } else if (departmentName) {
        const dept = await deptService.findByName(db, ctx.orgId, departmentName);
        if (dept) {
          departmentId = dept.id;
        } else {
          const newDept = await deptService.createDepartment(db, {
            orgId: ctx.orgId,
            name: departmentName,
          });
          departmentId = newDept.id;
        }
      }
    } catch {
      // departments table may not exist yet — proceed without departmentId
      departmentId = null;
    }

    // Resolve teamId if provided (by id or name)
    let teamId: string | null = null;
    try {
      if (parsed.data.teamId) {
        const t = await teamService.findById(db, ctx.orgId, parsed.data.teamId);
        if (t) teamId = t.id;
      } else if (parsed.data.team) {
        let t = await teamService.findByName(db, ctx.orgId, parsed.data.team);
        if (!t) {
          t = await teamService.createTeam(db, { orgId: ctx.orgId, name: parsed.data.team });
        }
        teamId = t.id;
      }
    } catch {
      // teams table may not exist yet — proceed without teamId
      teamId = null;
    }

    // Resolve authority defaults
    const defaultAuthority = {
      canCreateTasks: true,
      canExecuteTasks: true,
      canAccessCompanyInfo: true,
      canCommunicateExternally: false,
      canModifyResources: false,
      spendingLimitCents: 0,
      requiresApprovalFor: ['financial_commitments', 'external_communications', 'irreversible_actions', 'high_impact_decisions'],
      forbiddenActions: [],
    };

    // Build insert data — only include columns that exist in the DB
    const insertData: Record<string, unknown> = {
      orgId: ctx.orgId,
      name: parsed.data.name,
      role: parsed.data.role,
      department: departmentName,
      status: 'active' as const,
    };
    // Add new columns only if they might exist (try-catch at DB level)
    if (departmentId) insertData.departmentId = departmentId;
    if (teamId) insertData.teamId = teamId;
    insertData.authority = { ...defaultAuthority, ...parsed.data.authority };
    insertData.capabilities = parsed.data.capabilities ?? [];

    const agent = await agents.createAgent(db, insertData as NewAgent);

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'agent.hired',
      outcome: 'success',
    });

    // Notify
    try {
      const { shouldNotify, getNotificationPrefs } = await import('../services/notification-preferences.js');
      const { createNotification } = await import('../routes/notifications.js');
      const prefs = await getNotificationPrefs(db, ctx.orgId);
      if (shouldNotify(prefs, 'inApp', 'agent')) {
        createNotification(
          db,
          ctx.orgId,
          'agent',
          'AI Employee Hired',
          `${agent.name} (${agent.role}) has joined your organization and is now active.`,
        );
      }
    } catch { /* notification failure is non-fatal */ }

    reply.code(201);
    return { data: agent };
  });

  /** Update an agent — rename, reassign, configure authority, pause/resume. */
  app.patch<{ Params: { id: string } }>(
    '/v1/agents/:id',
    async (request, reply) => {
      const ctx = await requireAuth(request, deps);
      // Validate UUID format to prevent SQL errors on malformed IDs
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.id)) {
        reply.code(404);
        return { error: { code: 'not_found', message: 'Agent not found' } };
      }
      const parsed = patchBody.safeParse(request.body);
      if (!parsed.success) throw validation(parsed.error.flatten());

      const agent = await agents.findById(db, ctx.orgId, request.params.id);
      if (!agent) {
        reply.code(404);
        return { error: { code: 'not_found', message: 'Agent not found' } };
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (parsed.data.name !== undefined) updates.name = parsed.data.name;
      if (parsed.data.role !== undefined) updates.role = parsed.data.role;
      if (parsed.data.status !== undefined) updates.status = parsed.data.status;
      if (parsed.data.currentTask !== undefined) updates.currentTask = parsed.data.currentTask;
      if (parsed.data.capabilities !== undefined) updates.capabilities = parsed.data.capabilities;
      if (parsed.data.authority !== undefined) {
        updates.authority = { ...(agent.authority as Record<string, unknown>), ...parsed.data.authority };
      }

      // Department reassignment
      if (parsed.data.departmentId !== undefined) {
        updates.departmentId = parsed.data.departmentId;
        if (parsed.data.departmentId) {
          const dept = await deptService.findById(db, ctx.orgId, parsed.data.departmentId);
          updates.department = dept?.name ?? null;
        } else {
          updates.department = null;
        }
      } else if (parsed.data.department !== undefined) {
        // Backward compat: text-based department assignment
        updates.department = parsed.data.department;
        if (parsed.data.department) {
          let dept = await deptService.findByName(db, ctx.orgId, parsed.data.department);
          if (!dept) {
            dept = await deptService.createDepartment(db, {
              orgId: ctx.orgId,
              name: parsed.data.department,
            });
          }
          updates.departmentId = dept.id;
        } else {
          updates.departmentId = null;
        }
      }

      // Team reassignment
      const teamChanged =
        parsed.data.teamId !== undefined && parsed.data.teamId !== (agent.teamId ?? null);

      if (parsed.data.teamId !== undefined) {
        if (parsed.data.teamId) {
          const t = await teamService.findById(db, ctx.orgId, parsed.data.teamId);
          if (!t) {
            reply.code(400);
            return { error: { code: 'bad_request', message: 'Team not found in this organization.' } };
          }
          updates.teamId = t.id;
          // Consistency: an agent assigned to a team that belongs to a department
          // inherits that department when they have none of their own.
          if (!agent.departmentId && t.departmentId) {
            const dept = await deptService.findById(db, ctx.orgId, t.departmentId);
            updates.departmentId = t.departmentId;
            updates.department = dept?.name ?? null;
          }
        } else {
          updates.teamId = null;
        }
      } else if (parsed.data.team !== undefined) {
        // Backward compat: text-based team assignment
        if (parsed.data.team) {
          let t = await teamService.findByName(db, ctx.orgId, parsed.data.team);
          if (!t) {
            t = await teamService.createTeam(db, { orgId: ctx.orgId, name: parsed.data.team });
          }
          updates.teamId = t.id;
        } else {
          updates.teamId = null;
        }
      }

      const updated = await db
        .update(agentsTable)
        .set(updates)
        .where(and(eq(agentsTable.id, request.params.id), eq(agentsTable.orgId, ctx.orgId)))
        .returning();

      if (!updated[0]) {
        reply.code(404);
        return { error: { code: 'not_found', message: 'Agent not found' } };
      }

      await appendAudit(db, {
        orgId: ctx.orgId,
        actorType: 'user',
        actorId: ctx.userId,
        action: parsed.data.status === 'paused' ? 'agent.paused' :
                parsed.data.status === 'active' ? 'agent.resumed' :
                teamChanged ? 'agent.reassigned' :
                parsed.data.name ? 'agent.renamed' : 'agent.updated',
        outcome: 'success',
      });

      return { data: updated[0] };
    },
  );

  // ─── Emergency Stop ──────────────────────────────────────────────────────

  /**
   * POST /v1/agents/emergency-stop — Pause all agents immediately.
   */
  app.post('/v1/agents/emergency-stop', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { emergencyStopAll } = await import('../services/emergency-stop.js');
    const result = await emergencyStopAll(db, ctx.orgId, ctx.userId);
    reply.code(200);
    return { data: result };
  });

  /**
   * POST /v1/agents/:id/emergency-stop — Pause a specific agent.
   */
  app.post<{ Params: { id: string } }>('/v1/agents/:id/emergency-stop', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { emergencyStopAgent } = await import('../services/emergency-stop.js');
    const result = await emergencyStopAgent(db, ctx.orgId, request.params.id, ctx.userId);
    reply.code(200);
    return { data: result };
  });

  /**
   * POST /v1/agents/resume-all — Resume all paused agents.
   */
  app.post('/v1/agents/resume-all', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { resumeAllAgents } = await import('../services/emergency-stop.js');
    const result = await resumeAllAgents(db, ctx.orgId, ctx.userId);
    reply.code(200);
    return { data: result };
  });

  /**
   * POST /v1/agents/:id/resume — Resume a specific agent.
   */
  app.post<{ Params: { id: string } }>('/v1/agents/:id/resume', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { resumeAgent } = await import('../services/emergency-stop.js');
    const resumed = await resumeAgent(db, ctx.orgId, request.params.id, ctx.userId);
    if (!resumed) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Agent not found or not paused' } };
    }
    reply.code(200);
    return { data: { resumed: true } };
  });
}
