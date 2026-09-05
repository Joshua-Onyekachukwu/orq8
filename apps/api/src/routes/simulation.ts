import { z } from 'zod';
import { validation } from '@orq8/core';
import {
  type Db,
  type NewSimulation,
  type Simulation,
} from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { createSimulation, listSimulations, getSimulation, updateSimulation, runSimulation, applySimulation, logAnalyticsEvent } from '../services/simulation.js';
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
        properties: { simulationId: sim.id, name: sim.name },
      });
      return { data: applied };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply simulation';
      reply.code(400);
      return { error: { code: 'cannot_apply', message } };
    }
  });
}
