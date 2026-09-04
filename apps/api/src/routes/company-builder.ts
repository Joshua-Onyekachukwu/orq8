import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import * as builder from '../services/company-builder.js';
import * as onboarding from '../services/onboarding.js';
import type { AppDeps } from '../types.js';

const analyzeBody = z.object({
  description: z.string().trim().min(10).max(4000),
  sourceType: z.enum(['idea', 'existing']).default('idea'),
});

const planBody = z.object({
  analysis: z.record(z.string(), z.unknown()),
});

const activateBody = z.object({
  plan: z.record(z.string(), z.unknown()),
});

/**
 * Company Builder routes:
 *   POST /v1/company-builder/analyze   — understand the founder's idea/company
 *   POST /v1/company-builder/plan      — generate proposed org + operating plan
 *   POST /v1/company-builder/activate  — create departments, agents, goals, tasks
 *   GET  /v1/company-builder/state     — resume current discovery state
 */
export function registerCompanyBuilderRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, config, logger } = deps;

  /** Analyze the founder's input into structured company understanding. */
  app.post('/v1/company-builder/analyze', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = analyzeBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    logger.info({ orgId: ctx.orgId, sourceType: parsed.data.sourceType }, 'Company Builder: analyzing company');

    try {
      const analysis = await builder.analyzeCompany(config, db, ctx.orgId, {
        description: parsed.data.description,
        sourceType: parsed.data.sourceType,
      });

      // Persist so the founder can resume later
      await onboarding.update(db, ctx.userId, {
        step: 'analysis',
        organization: {
          ...(await onboarding.getOrCreate(db, ctx.userId, ctx.orgId)).organization,
          analysis: analysis as unknown as Record<string, unknown>,
        },
      });

      reply.code(200);
      return { data: { analysis } };
    } catch (error) {
      logger.error({ err: error, orgId: ctx.orgId }, 'Company Builder: analysis failed');
      reply.code(500);
      return { error: { code: 'company_builder.analyze_failed', message: 'Failed to analyze your company. Please try again.' } };
    }
  });

  /** Generate the proposed organization + operating plan from an analysis. */
  app.post('/v1/company-builder/plan', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = planBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const analysis = parsed.data.analysis as unknown as builder.CompanyAnalysis;
    if (!analysis?.rawInput) {
      reply.code(400);
      return { error: { code: 'validation', message: 'A valid company analysis is required. Run analyze first.' } };
    }

    try {
      const plan = await builder.generatePlan(config, db, ctx.orgId, analysis);
      await onboarding.update(db, ctx.userId, {
        step: 'plan',
        organization: {
          ...(await onboarding.getOrCreate(db, ctx.userId, ctx.orgId)).organization,
          plan: plan as unknown as Record<string, unknown>,
        },
      });
      return { data: { plan } };
    } catch (error) {
      logger.error({ err: error, orgId: ctx.orgId }, 'Company Builder: plan generation failed');
      reply.code(500);
      return { error: { code: 'company_builder.plan_failed', message: 'Failed to generate your operating plan. Please try again.' } };
    }
  });

  /** Activate the approved plan — create everything through real services. */
  app.post('/v1/company-builder/activate', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = activateBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const plan = parsed.data.plan as unknown as builder.CompanyPlan;
    if (!plan?.agents?.length || !plan?.departments?.length) {
      reply.code(400);
      return { error: { code: 'validation', message: 'A valid operating plan is required. Run plan first.' } };
    }

    try {
      const result = await builder.activateCompany(db, ctx.orgId, ctx.userId, plan);

      // Mark onboarding complete
      await onboarding.update(db, ctx.userId, {
        step: 'complete',
        completedAt: new Date(),
        organization: {
          ...(await onboarding.getOrCreate(db, ctx.userId, ctx.orgId)).organization,
          activation: result as unknown as Record<string, unknown>,
        },
      });

      reply.code(201);
      return { data: { activation: result } };
    } catch (error) {
      logger.error({ err: error, orgId: ctx.orgId }, 'Company Builder: activation failed');
      reply.code(500);
      return { error: { code: 'company_builder.activate_failed', message: 'Failed to activate your company. Please try again.' } };
    }
  });

  /** Get the current discovery state (analysis + plan, if any). */
  app.get('/v1/company-builder/state', async (request) => {
    const ctx = await requireAuth(request, deps);
    const state = await onboarding.getOrCreate(db, ctx.userId, ctx.orgId);
    const organization = (state.organization ?? {}) as Record<string, unknown>;
    return {
      data: {
        step: state.step,
        completedAt: state.completedAt ?? null,
        analysis: organization.analysis ?? null,
        plan: organization.plan ?? null,
        activation: organization.activation ?? null,
      },
    };
  });
}