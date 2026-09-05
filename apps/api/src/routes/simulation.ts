import { z } from 'zod';
import { validation } from '@orq8/core';
import {
  type Db,
  type NewSimulation,
  type Simulation,
} from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { createSimulation, listSimulations, getSimulation, updateSimulation, runSimulation, applySimulation, saveProposal, logAnalyticsEvent } from '../services/simulation.js';
import type { AppDeps } from '../types.js';

const createSimBody = z.object({
  name: z.string().trim().min(1).max(200),
  objective: z.string().max(500).optional(),
  changeDescription: z.string().trim().min(1).max(2000),
  proposedDepartments: z.number().int().min(0).optional(),
  proposedAgents: z.number().int().min(0).optional(),
  currentDepartments: z.number().int().min(0).optional(),
  currentAgents: z.number().int().min(0).optional(),
  currentTasksPerWeek: z.number().int().min(0).optional(),
  proposedTasksPerWeek: z.number().int().min(0).optional(),
  avgCreditsPerTask: z.number().int().min(0).optional(),
});

const patchSimBody = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  objective: z.string().max(500).optional(),
  changeDescription: z.string().trim().min(1).max(2000).optional(),
  state: z.enum(['draft', 'proposed', 'reviewed']).optional(),
  recommendation: z.string().max(2000).optional(),
});

const proposalAgentBody = z.object({
  name: z.string().trim().min(1).max(100),
  role: z.string().trim().min(1).max(100),
  reportsTo: z.string().trim().min(1).max(100).optional(),
  weeklyCost: z.number().int().min(0).optional(),
  capabilities: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
});

const proposalTeamBody = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000).optional(),
  lead: z.string().trim().min(1).max(100).optional(),
  agents: z.array(proposalAgentBody).max(200).optional(),
});

const proposalDepartmentBody = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000).optional(),
  head: z.string().trim().min(1).max(100).optional(),
  teams: z.array(proposalTeamBody).max(100).optional(),
});

const proposalBody = z.object({
  rationale: z.string().trim().min(1).max(4000),
  departments: z.array(proposalDepartmentBody).min(1).max(50),
  goals: z.array(z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(2000).optional() })).max(100).optional(),
});

const runSimBody = z.object({
  proposedDepartments: z.number().int().min(0).optional(),
  proposedAgents: z.number().int().min(0).optional(),
  currentDepartments: z.number().int().min(0).optional(),
  currentAgents: z.number().int().min(0).optional(),
  currentTasksPerWeek: z.number().int().min(0).optional(),
  proposedTasksPerWeek: z.number().int().min(0).optional(),
  avgCreditsPerTask: z.number().int().min(0).optional(),
});

export function registerSimulationRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.get('/v1/simulations', async (request) => {
    const ctx = await requireAuth(request, deps);
    const simulations = await listSimulations(db, ctx.orgId);
    return { data: simulations };
  });

  app.get<{ Params: { id: string } }>('/v1/simulations/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const sim = await getSimulation(db, ctx.orgId, request.params.id);
    if (!sim) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Simulation not found' } };
    }
    return { data: sim };
  });

  app.post('/v1/simulations', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = createSimBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const sim = await createSimulation(db, ctx.orgId, {
      name: parsed.data.name,
      objective: parsed.data.objective,
      changeDescription: parsed.data.changeDescription,
      state: 'draft',
    } as NewSimulation);

    reply.code(201);
    return { data: sim };
  });

  app.patch<{ Params: { id: string } }>('/v1/simulations/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const sim = await getSimulation(db, ctx.orgId, request.params.id);
    if (!sim) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Simulation not found' } };
    }

    const parsed = patchSimBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const updated = await updateSimulation(db, request.params.id, {
      ...parsed.data,
    });
    return { data: updated };
  });

  app.post<{ Params: { id: string } }>('/v1/simulations/:id/run', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const sim = await getSimulation(db, ctx.orgId, request.params.id);
    if (!sim) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Simulation not found' } };
    }

    if (sim.state === 'applied') {
      return { data: { error: 'Already applied. Create a new simulation to run again.' } };
    }

    const parsed = runSimBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    // Stored proposal values are jsonb arrays of { count } — read them defensively.
    const storedDepartments = Array.isArray(sim.proposedDepartments)
      ? (sim.proposedDepartments as unknown as { count?: number }[])[0]?.count
      : undefined;
    const storedAgents = Array.isArray(sim.proposedAgents)
      ? (sim.proposedAgents as unknown as { count?: number }[])[0]?.count
      : undefined;

    const proposedDepartments = parsed.data.proposedDepartments ?? storedDepartments;
    const proposedAgents = parsed.data.proposedAgents ?? storedAgents;

    const input = {
      name: sim.name,
      objective: sim.objective ?? undefined,
      changeDescription: sim.changeDescription,
      proposedDepartments,
      proposedAgents,
      currentDepartments: parsed.data.currentDepartments,
      currentAgents: parsed.data.currentAgents,
      currentTasksPerWeek: parsed.data.currentTasksPerWeek ?? 0,
      proposedTasksPerWeek: parsed.data.proposedTasksPerWeek ?? 0,
      avgCreditsPerTask: parsed.data.avgCreditsPerTask ?? 50,
    };

    const result = await runSimulation(db, ctx.orgId, request.params.id, input);

    await logAnalyticsEvent(db, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      eventName: 'simulation.run',
      properties: { simulationId: sim.id, name: sim.name, risk: result.projectedRisk },
    });

    return { data: result };
  });

  app.post<{ Params: { id: string } }>('/v1/simulations/:id/proposal', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const sim = await getSimulation(db, ctx.orgId, request.params.id);
    if (!sim) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Simulation not found' } };
    }

    const parsed = proposalBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    // Duplicate names inside the proposal would break materialization mapping —
    // reject before persisting.
    const names = new Set<string>();
    for (const d of parsed.data.departments) {
      if (names.has(d.name)) {
        reply.code(400);
        return { error: { code: 'duplicate_name', message: `Duplicate department name: ${d.name}` } };
      }
      names.add(d.name);
      for (const t of d.teams ?? []) {
        if (names.has(t.name)) {
          reply.code(400);
          return { error: { code: 'duplicate_name', message: `Duplicate team name: ${t.name}` } };
        }
        names.add(t.name);
        for (const a of t.agents ?? []) {
          if (names.has(a.name)) {
            reply.code(400);
            return { error: { code: 'duplicate_name', message: `Duplicate agent name: ${a.name}` } };
          }
          names.add(a.name);
        }
      }
    }

    const proposal = await saveProposal(db, ctx.orgId, request.params.id, parsed.data);

    await logAnalyticsEvent(db, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      eventName: 'simulation.proposal.saved',
      properties: { simulationId: sim.id, name: sim.name, proposalId: proposal.proposalId },
    });

    reply.code(201);
    return { data: proposal };
  });

  app.post<{ Params: { id: string } }>('/v1/simulations/:id/apply', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const sim = await getSimulation(db, ctx.orgId, request.params.id);
    if (!sim) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Simulation not found' } };
    }

    try {
      const applied = await applySimulation(db, ctx.orgId, request.params.id, ctx.userId);
      await logAnalyticsEvent(db, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        eventName: 'simulation.applied',
        properties: { simulationId: sim.id, name: sim.name, status: applied.status },
      });

      switch (applied.status) {
        case 'pending_approval':
          reply.code(202);
          return {
            data: {
              status: applied.status,
              approvalId: applied.approvalId,
              message: 'Approval required — the founder must approve before any organizational change is created.',
            },
          };
        case 'rejected':
          reply.code(400);
          return {
            error: {
              code: 'approval_rejected',
              approvalId: applied.approvalId,
              message: 'The apply request was rejected — amend the proposal and submit a new apply request.',
            },
          };
        case 'already_applied':
          return { data: { status: applied.status, message: 'Simulation was already applied — no changes made.' } };
        case 'applied':
          return { data: { status: applied.status, created: applied.created, simulation: applied.simulation } };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply simulation';
      reply.code(400);
      return { error: { code: 'cannot_apply', message } };
    }
  });
}
