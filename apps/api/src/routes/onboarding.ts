import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import * as onboarding from '../services/onboarding.js';
import type { AppDeps } from '../types.js';


const updateBody = z.object({
  step: z.enum(['organization', 'constitution', 'agents', 'complete']),
  data: z.record(z.string(), z.unknown()).optional(),
});

export function registerOnboardingRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** GET /v1/onboarding — Get current onboarding state. */
  app.get('/v1/onboarding', async (request) => {
    const ctx = await requireAuth(request, deps);
    const state = await onboarding.getOrCreate(db, ctx.userId, ctx.orgId);
    return { data: state };
  });

  /** POST /v1/onboarding — Update onboarding state. */
  app.post('/v1/onboarding', async (request) => {
    const ctx = await requireAuth(request, deps);
    const parsed = updateBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const { step, data } = parsed.data;
    const updateData: Parameters<typeof onboarding.update>[2] = { step };

    if (step === 'organization' && data) {
      updateData.organization = data;
    } else if (step === 'constitution' && data) {
      updateData.constitution = data;
    } else if (step === 'agents' && data) {
      updateData.agentSelections = (data.agents as Array<Record<string, unknown>>) ?? [];
      if (data.complete) {
        updateData.completedAt = new Date();
        updateData.step = 'complete';
      }
    }

    await onboarding.update(db, ctx.userId, updateData);
    const state = await onboarding.getOrCreate(db, ctx.userId, ctx.orgId);
    return { data: state };
  });
}
